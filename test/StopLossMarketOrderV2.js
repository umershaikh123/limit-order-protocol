const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');

// Helper function to build extension data for AmountGetter
function buildStopLossExtensionData(stopLossAddress, extraData = '0x') {
    return ethers.solidityPacked(
        ['address', 'bytes'],
        [stopLossAddress, extraData]
    );
}

describe('StopLossMarketOrderV2', function () {
    let addr, addr1, keeper, attacker;
    let dai, weth, inch, swap, chainId;
    let stopLossExtension;
    let daiOracle, wethOracle, inchOracle;
    let aggregationRouter;

    before(async function () {
        [addr, addr1, keeper, attacker] = await ethers.getSigners();
    });

    async function deployContractsAndInit() {
        // Deploy base contracts
        const tokens = await deploySwapTokens();
        dai = tokens.dai;
        weth = tokens.weth;
        inch = tokens.inch;
        swap = tokens.swap;
        chainId = tokens.chainId;

        // Mint tokens
        await dai.mint(addr, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await inch.mint(addr, ether('1000000'));
        await dai.mint(addr1, ether('1000000'));
        await weth.connect(addr1).deposit({ value: ether('100') });
        await inch.mint(addr1, ether('1000000'));

        // Approve tokens
        await dai.approve(swap, ether('1000000'));
        await weth.approve(swap, ether('1000000'));
        await inch.approve(swap, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.connect(addr1).approve(swap, ether('1000000'));
        await inch.connect(addr1).approve(swap, ether('1000000'));

        // Deploy price oracles with same decimals (18) - use mutable version for testing
        const MutableAggregatorMock = await ethers.getContractFactory('MutableAggregatorMock');
        daiOracle = await MutableAggregatorMock.deploy(ether('0.00025')); // 1 DAI = 0.00025 ETH
        await daiOracle.waitForDeployment();
        wethOracle = await MutableAggregatorMock.deploy(ether('1')); // 1 WETH = 1 ETH
        await wethOracle.waitForDeployment();
        inchOracle = await MutableAggregatorMock.deploy('1577615249227853'); // ~0.00157 ETH
        await inchOracle.waitForDeployment();

        // Deploy mock aggregation router
        const MockAggregationRouter = await ethers.getContractFactory('MockAggregationRouter');
        aggregationRouter = await MockAggregationRouter.deploy();
        await aggregationRouter.waitForDeployment();

        // Deploy StopLossMarketOrderV2 extension
        const StopLossMarketOrderV2 = await ethers.getContractFactory('StopLossMarketOrderV2');
        stopLossExtension = await StopLossMarketOrderV2.deploy(
            await swap.getAddress()
        );
        await stopLossExtension.waitForDeployment();

        // Set oracle heartbeats (4 hours following ChainlinkCalculator)
        await stopLossExtension.setOracleHeartbeat(await daiOracle.getAddress(), 4 * 3600);
        await stopLossExtension.setOracleHeartbeat(await wethOracle.getAddress(), 4 * 3600);
        await stopLossExtension.setOracleHeartbeat(await inchOracle.getAddress(), 4 * 3600);

        // Approve the aggregation router
        await stopLossExtension.setAggregationRouterApproval(
            await aggregationRouter.getAddress(),
            true
        );

        return {
            dai, weth, inch, swap, chainId,
            stopLossExtension,
            daiOracle, wethOracle, inchOracle,
            aggregationRouter
        };
    }

    describe('IAmountGetter Integration', function () {
        it('should work as AmountGetter for dynamic pricing', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            // Create order with stop loss extension as AmountGetter
            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            }, {
                // Use stop loss extension as AmountGetter
                makingAmountData: buildStopLossExtensionData(await stopLossExtension.getAddress()),
                takingAmountData: buildStopLossExtensionData(await stopLossExtension.getAddress()),
            });

            const orderHash = await swap.hashOrder(order);

            // Configure stop loss (current price ~4000, stop at 3800)
            await stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: ether('3800'), // Stop when WETH/DAI < 3800
                maxSlippage: 100, // 1%
                maxPriceDeviation: 500, // 5%
                isStopLoss: true,
                keeper: ethers.ZeroAddress, // Any keeper
                orderMaker: addr1.address,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Check that stop loss is not triggered at current price
            const [triggered1, price1] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered1).to.be.false;
            expect(price1).to.equal(ether('4000')); // 1 WETH / 0.00025 ETH = 4000

            // Wait to allow price history to build 
            await ethers.provider.send("evm_increaseTime", [60]); // 1 minute
            await ethers.provider.send("evm_mine");

            // Lower the price to trigger stop loss
            await daiOracle.updateAnswer(ether('0.0003')); // 1 DAI = 0.0003 ETH
            // New price: 1 WETH / 0.0003 ETH = 3333.33 DAI < 3800

            // Wait for TWAP to adjust to new price
            await ethers.provider.send("evm_increaseTime", [60]); // 1 minute  
            await ethers.provider.send("evm_mine");

            // Check that stop loss is now triggered
            const [triggered2, price2] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered2).to.be.true;
            expect(price2).to.be.lt(ether('3800'));
        });

        it('should return 0 making amount when stop loss not triggered', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure stop loss at lower price (not triggered)
            await stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: ether('3500'), // Much lower than current 4000
                maxSlippage: 100,
                maxPriceDeviation: 500,
                isStopLoss: true,
                keeper: ethers.ZeroAddress,
                orderMaker: addr1.address,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Call getMakingAmount - should return 0 (not executable)
            const makingAmount = await stopLossExtension.getMakingAmount(
                order,
                '0x',
                orderHash,
                addr.address,
                ether('4000'),
                ether('1'),
                '0x'
            );

            expect(makingAmount).to.equal(0);
        });
    });

    describe('TWAP Price Protection', function () {
        it('should use TWAP price for manipulation resistance', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure stop loss
            await stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: ether('3800'),
                maxSlippage: 100,
                maxPriceDeviation: 300, // 3% max deviation
                isStopLoss: true,
                keeper: ethers.ZeroAddress,
                orderMaker: addr1.address,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Initial state - not triggered
            let [triggered] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.false;

            // Try to manipulate price with large deviation - should fail
            await expect(
                daiOracle.updateAnswer(ether('0.0004')) // 50% price increase
            ).to.not.be.reverted; // Oracle update succeeds

            // But preInteraction should fail due to price deviation
            await expect(
                stopLossExtension.preInteraction(
                    order,
                    '0x',
                    orderHash,
                    addr.address,
                    ether('1'),
                    ether('4000'),
                    ether('1'),
                    '0x'
                )
            ).to.be.revertedWithCustomError(stopLossExtension, 'PriceDeviationTooHigh');
        });
    });

    describe('Token Decimal Handling', function () {
        it('should handle different token decimals correctly', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            // Deploy token with 6 decimals (like USDC)  
            const TokenCustomDecimalsMock = await ethers.getContractFactory('TokenCustomDecimalsMock');
            const usdc = await TokenCustomDecimalsMock.deploy('USDC', 'USDC', '0', 6);
            await usdc.waitForDeployment();
            
            await usdc.mint(addr1, '1000000000000'); // 1M USDC (6 decimals)
            await usdc.connect(addr1).approve(swap, '1000000000000');

            const order = buildOrder({
                makerAsset: await weth.getAddress(), // 18 decimals
                takerAsset: await usdc.getAddress(), // 6 decimals
                makingAmount: ether('1'), // 1 WETH
                takingAmount: '4000000000', // 4000 USDC (6 decimals)
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure stop loss with proper decimal handling
            await stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(), // Use DAI oracle for price
                stopPrice: ether('3800'),
                maxSlippage: 100,
                maxPriceDeviation: 500,
                isStopLoss: true,
                keeper: ethers.ZeroAddress,
                orderMaker: addr1.address,
                configuredAt: 0,
                makerTokenDecimals: 18, // WETH
                takerTokenDecimals: 6   // USDC
            });

            // Wait for price history to build
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");

            // Lower price to trigger stop loss  
            await daiOracle.updateAnswer(ether('0.0003'));

            // Wait for TWAP to adjust
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");

            // Verify stop loss is triggered first
            const [triggered] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.true;

            // Check amounts are calculated correctly with different decimals
            const makingAmount = await stopLossExtension.getMakingAmount(
                order,
                '0x',
                orderHash,
                addr.address,
                '3333000000', // 3333 USDC (6 decimals)
                ether('1'),
                '0x'
            );

            // Should return appropriate making amount in 18 decimals
            expect(makingAmount).to.be.gt(0);
        });
    });

    describe('Security Features', function () {
        it('should reject unauthorized stop loss configuration', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Attacker tries to configure stop loss for someone else's order
            await expect(
                stopLossExtension.connect(attacker).configureStopLoss(orderHash, addr1.address, {
                    makerAssetOracle: await wethOracle.getAddress(),
                    takerAssetOracle: await daiOracle.getAddress(),
                    stopPrice: ether('3800'),
                    maxSlippage: 100,
                    maxPriceDeviation: 500,
                    isStopLoss: true,
                    keeper: keeper.address,
                    orderMaker: addr1.address,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(stopLossExtension, 'UnauthorizedCaller');
        });

        it('should validate oracle parameters', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Invalid oracle (zero address)
            await expect(
                stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                    makerAssetOracle: ethers.ZeroAddress,
                    takerAssetOracle: await daiOracle.getAddress(),
                    stopPrice: ether('3800'),
                    maxSlippage: 100,
                    maxPriceDeviation: 500,
                    isStopLoss: true,
                    keeper: keeper.address,
                    orderMaker: addr1.address,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(stopLossExtension, 'InvalidOracle');
        });

        it('should reject excessive slippage and price deviation', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Excessive slippage (over 50%)
            await expect(
                stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                    makerAssetOracle: await wethOracle.getAddress(),
                    takerAssetOracle: await daiOracle.getAddress(),
                    stopPrice: ether('3800'),
                    maxSlippage: 6000, // 60% - should fail
                    maxPriceDeviation: 500,
                    isStopLoss: true,
                    keeper: keeper.address,
                    orderMaker: addr1.address,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(stopLossExtension, 'InvalidSlippageTolerance');

            // Excessive price deviation (over 10%)
            await expect(
                stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                    makerAssetOracle: await wethOracle.getAddress(),
                    takerAssetOracle: await daiOracle.getAddress(),
                    stopPrice: ether('3800'),
                    maxSlippage: 100,
                    maxPriceDeviation: 1500, // 15% - should fail
                    isStopLoss: true,
                    keeper: keeper.address,
                    orderMaker: addr1.address,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(stopLossExtension, 'PriceDeviationTooHigh');
        });

        it('should allow owner to recover stuck tokens', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension } = contracts;

            // Send some tokens to the contract
            await dai.transfer(await stopLossExtension.getAddress(), ether('100'));

            // Owner can recover
            await expect(
                stopLossExtension.emergencyRecoverToken(
                    await dai.getAddress(),
                    addr.address,
                    ether('100')
                )
            ).to.not.be.reverted;

            // Non-owner cannot recover
            await expect(
                stopLossExtension.connect(addr1).emergencyRecoverToken(
                    await dai.getAddress(),
                    addr1.address,
                    ether('1')
                )
            ).to.be.revertedWithCustomError(stopLossExtension, 'OwnableUnauthorizedAccount');
        });
    });

    describe('Pause Functionality', function () {
        it('should allow owner to pause and unpause', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension } = contracts;

            // Owner can pause
            await expect(stopLossExtension.pause()).to.not.be.reverted;

            // Owner can unpause
            await expect(stopLossExtension.unpause()).to.not.be.reverted;

            // Non-owner cannot pause
            await expect(
                stopLossExtension.connect(addr1).pause()
            ).to.be.revertedWithCustomError(stopLossExtension, 'OwnableUnauthorizedAccount');
        });

        it('should block takerInteraction when paused', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle } = contracts;

            // Pause the contract first before creating order
            await stopLossExtension.pause();

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            }, {
                preInteraction: await stopLossExtension.getAddress(),
                postInteraction: await stopLossExtension.getAddress()
            });

            const orderHash = await swap.hashOrder(order);

            // Configure and trigger stop loss with no price deviation limit
            await stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: ether('3800'),
                maxSlippage: 100,
                maxPriceDeviation: 0, // Disable price deviation check
                isStopLoss: true,
                keeper: ethers.ZeroAddress,
                orderMaker: addr1.address,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Wait for price history
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");

            // Lower price to trigger
            await daiOracle.updateAnswer(ether('0.0003'));
            
            // Wait for TWAP
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);

            const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'address', 'uint256'],
                [await weth.getAddress(), await dai.getAddress(), ether('3333')]
            );

            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes'],
                [await aggregationRouter.getAddress(), swapData]
            );

            const takerTraits = buildTakerTraits({
                extension: order.extension,
                interaction: extraData
            });

            // Should fail when paused
            await expect(
                swap.fillOrderArgs(
                    order,
                    r,
                    vs,
                    ether('1'),
                    takerTraits.traits,
                    takerTraits.args
                )
            ).to.be.revertedWithCustomError(stopLossExtension, 'EnforcedPause');
        });
    });

    describe('Full Integration Test', function () {
        it('should execute complete stop loss flow with 1inch integration', async function () {
            this.timeout(60000); // Increase timeout for complex test
            
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, daiOracle, wethOracle, aggregationRouter } = contracts;

            // Create order with stop loss extension as IAmountGetter only
            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            }, {
                // Use only IAmountGetter interface, not interactions for this integration test
                makingAmountData: buildStopLossExtensionData(await stopLossExtension.getAddress()),
                takingAmountData: buildStopLossExtensionData(await stopLossExtension.getAddress())
            });

            const orderHash = await swap.hashOrder(order);

            // Configure stop loss with no price deviation limit for testing
            await stopLossExtension.connect(addr1).configureStopLoss(orderHash, addr1.address, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: ether('3800'),
                maxSlippage: 100, // 1%
                maxPriceDeviation: 0, // Disable for testing
                isStopLoss: true,
                keeper: ethers.ZeroAddress,
                orderMaker: addr1.address,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Verify not triggered initially
            let [triggered] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.false;

            // Wait for price history to build
            await ethers.provider.send("evm_increaseTime", [60]); // 1 minute
            await ethers.provider.send("evm_mine");
            
            // Lower price to trigger stop loss
            await daiOracle.updateAnswer(ether('0.0003')); // New price to trigger
            
            // Wait for TWAP to adjust
            await ethers.provider.send("evm_increaseTime", [60]); // 1 minute
            await ethers.provider.send("evm_mine");
            
            // Verify stop loss is now triggered
            [triggered] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.true;

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);

            // Prepare swap data for aggregation router
            const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'address', 'uint256'],
                [await weth.getAddress(), await dai.getAddress(), ether('3333')]
            );

            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'bytes'],
                [await aggregationRouter.getAddress(), swapData]
            );

            const takerTraits = buildTakerTraits({
                extension: order.extension
            });

            // Execute the stop loss order via IAmountGetter
            const fillTx = swap.fillOrderArgs(
                order,
                r,
                vs,
                ether('1'),
                takerTraits.traits,
                takerTraits.args
            );

            // Verify the trade executed successfully (simple balance checks)
            await expect(fillTx).to.not.be.reverted;
            
            // Check balances changed correctly
            await expect(fillTx).to.changeTokenBalances(
                weth, 
                [addr1, addr], 
                [ether('-1'), ether('1')] // addr1 loses WETH, addr gains WETH
            );
        });
    });
});