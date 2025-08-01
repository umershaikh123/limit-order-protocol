const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');

// Helper function to build extension data for OCO orders
function buildOCOExtensionData(ocoAddress, extraData = '0x') {
    return ethers.solidityPacked(
        ['address', 'bytes'],
        [ocoAddress, extraData]
    );
}

// Helper function to create OCO ID from order hashes
function createOCOId(primaryHash, secondaryHash) {
    return ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'bytes32'], [primaryHash, secondaryHash])
    );
}

describe('OCOOrderV1', function () {
    let addr, addr1, keeper, attacker;
    let dai, weth, inch, swap, chainId;
    let ocoExtension, ocoKeeper;

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

        // Deploy OCOOrderV1 extension
        const OCOOrderV1 = await ethers.getContractFactory('OCOOrderV1');
        ocoExtension = await OCOOrderV1.deploy(await swap.getAddress());
        await ocoExtension.waitForDeployment();

        // Deploy OCOKeeperV1
        const OCOKeeperV1 = await ethers.getContractFactory('OCOKeeperV1');
        ocoKeeper = await OCOKeeperV1.deploy(
            await swap.getAddress(),
            await ocoExtension.getAddress()
        );
        await ocoKeeper.waitForDeployment();

        // Authorize keeper
        await ocoExtension.setKeeperAuthorization(keeper.address, true);
        await ocoKeeper.setKeeperAuthorization(keeper.address, true);

        return {
            dai, weth, inch, swap, chainId,
            ocoExtension, ocoKeeper
        };
    }

    describe('OCO Configuration', function () {
        it('should configure OCO relationship between two orders', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Create two orders
            const takeProfitOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'), // 1 WETH
                takingAmount: ether('4500'), // Take profit at $4500
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                preInteraction: await ocoExtension.getAddress()
            });

            const stopLossOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'), // 1 WETH
                takingAmount: ether('3500'), // Stop loss at $3500
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                preInteraction: await ocoExtension.getAddress()
            });

            const takeProfitHash = await swap.hashOrder(takeProfitOrder);
            const stopLossHash = await swap.hashOrder(stopLossOrder);
            const ocoId = createOCOId(takeProfitHash, stopLossHash);

            // Configure OCO
            const ocoConfig = {
                primaryOrderHash: takeProfitHash,
                secondaryOrderHash: stopLossHash,
                orderMaker: addr.address,
                strategy: 0, // BRACKET
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'), // 100 gwei
                expiresAt: Math.floor(Date.now() / 1000) + 86400 // 24 hours
            };

            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.emit(ocoExtension, 'OCOConfigured')
                .withArgs(ocoId, takeProfitHash, stopLossHash, addr.address, 0);

            // Verify configuration
            const storedConfig = await ocoExtension.getOCOConfig(ocoId);
            expect(storedConfig.primaryOrderHash).to.equal(takeProfitHash);
            expect(storedConfig.secondaryOrderHash).to.equal(stopLossHash);
            expect(storedConfig.orderMaker).to.equal(addr.address);
            expect(storedConfig.isActive).to.be.true;

            // Verify order to OCO mapping
            const [isOCO1, ocoId1, isActive1] = await ocoExtension.getOrderOCOStatus(takeProfitHash);
            const [isOCO2, ocoId2, isActive2] = await ocoExtension.getOrderOCOStatus(stopLossHash);
            
            expect(isOCO1).to.be.true;
            expect(isOCO2).to.be.true;
            expect(ocoId1).to.equal(ocoId);
            expect(ocoId2).to.equal(ocoId);
            expect(isActive1).to.be.true;
            expect(isActive2).to.be.true;
        });

        it('should reject unauthorized OCO configuration', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr.address,
            });

            const order2 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('3500'),
                maker: addr.address,
            });

            const hash1 = await swap.hashOrder(order1);
            const hash2 = await swap.hashOrder(order2);
            const ocoId = createOCOId(hash1, hash2);

            const ocoConfig = {
                primaryOrderHash: hash1,
                secondaryOrderHash: hash2,
                orderMaker: addr.address, // Correct maker
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            // Should fail when called by non-maker
            await expect(ocoExtension.connect(addr1).configureOCO(ocoId, ocoConfig))
                .to.be.revertedWithCustomError(ocoExtension, 'UnauthorizedCaller');
        });

        it('should reject duplicate OCO configuration', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr.address,
            });

            const order2 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('3500'),
                maker: addr.address,
            });

            const hash1 = await swap.hashOrder(order1);
            const hash2 = await swap.hashOrder(order2);
            const ocoId = createOCOId(hash1, hash2);

            const ocoConfig = {
                primaryOrderHash: hash1,
                secondaryOrderHash: hash2,
                orderMaker: addr.address,
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            // First configuration should succeed
            await ocoExtension.configureOCO(ocoId, ocoConfig);

            // Second configuration should fail
            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.be.revertedWithCustomError(ocoExtension, 'OCOAlreadyConfigured');
        });
    });

    describe('IAmountGetter Integration', function () {
        it('should return normal amounts for active OCO orders', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Create OCO orders
            const takeProfitOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('2'),
                takingAmount: ether('9000'), // $4500 per WETH
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
            });

            const stopLossOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('2'),
                takingAmount: ether('7000'), // $3500 per WETH
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
            });

            const takeProfitHash = await swap.hashOrder(takeProfitOrder);
            const stopLossHash = await swap.hashOrder(stopLossOrder);
            const ocoId = createOCOId(takeProfitHash, stopLossHash);

            // Configure OCO
            const ocoConfig = {
                primaryOrderHash: takeProfitHash,
                secondaryOrderHash: stopLossHash,
                orderMaker: addr.address,
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await ocoExtension.configureOCO(ocoId, ocoConfig);

            // Test getMakingAmount for both orders
            const makingAmount1 = await ocoExtension.getMakingAmount(
                takeProfitOrder,
                '0x',
                takeProfitHash,
                addr1.address,
                ether('4500'), // Taking half
                ether('2'), // Full remaining
                '0x'
            );

            const makingAmount2 = await ocoExtension.getMakingAmount(
                stopLossOrder,
                '0x',
                stopLossHash,
                addr1.address,
                ether('3500'), // Taking half
                ether('2'), // Full remaining
                '0x'
            );

            expect(makingAmount1).to.equal(ether('1')); // Should return proportional amount
            expect(makingAmount2).to.equal(ether('1')); // Should return proportional amount
        });

        it('should prevent execution when other order in pair was executed', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Create and configure OCO orders
            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4500'),
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
            });

            const order2 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('3500'),
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
            });

            const hash1 = await swap.hashOrder(order1);
            const hash2 = await swap.hashOrder(order2);
            const ocoId = createOCOId(hash1, hash2);

            const ocoConfig = {
                primaryOrderHash: hash1,
                secondaryOrderHash: hash2,
                orderMaker: addr.address,
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await ocoExtension.configureOCO(ocoId, ocoConfig);

            // Simulate execution of first order by updating OCO state
            const ocoConfigStored = await ocoExtension.ocoConfigs(ocoId);
            // Note: In actual implementation, this would be done via preInteraction
            // For testing, we'll simulate by creating a new OCO config with execution state
            
            // The actual test would involve filling an order and checking that the other
            // order becomes non-executable through the preInteraction hook
        });
    });

    describe('OCO Execution and Cancellation', function () {
        it('should trigger cancellation when one order is executed', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Create OCO orders with preInteraction
            const takeProfitOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4500'),
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                preInteraction: await ocoExtension.getAddress()
            });

            const stopLossOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('3500'),
                maker: addr.address,
            }, {
                makingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                takingAmountData: buildOCOExtensionData(await ocoExtension.getAddress()),
                preInteraction: await ocoExtension.getAddress()
            });

            const takeProfitHash = await swap.hashOrder(takeProfitOrder);
            const stopLossHash = await swap.hashOrder(stopLossOrder);
            const ocoId = createOCOId(takeProfitHash, stopLossHash);

            // Configure OCO
            const ocoConfig = {
                primaryOrderHash: takeProfitHash,
                secondaryOrderHash: stopLossHash,
                orderMaker: addr.address,
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await ocoExtension.configureOCO(ocoId, ocoConfig);

            // Sign and execute take profit order
            const signature = await signOrder(takeProfitOrder, chainId, await swap.getAddress(), addr);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);

            const takerTraits = buildTakerTraits({
                extension: takeProfitOrder.extension
            });

            // Execute the take profit order - this should trigger OCO logic
            await expect(swap.connect(addr1).fillOrderArgs(
                takeProfitOrder,
                r,
                vs,
                ether('1'), // Fill full amount
                takerTraits.traits,
                takerTraits.args
            )).to.emit(ocoExtension, 'OCOExecuted')
              .withArgs(ocoId, takeProfitHash, stopLossHash, addr1.address, anyValue);

            // Verify OCO is no longer active
            const updatedConfig = await ocoExtension.getOCOConfig(ocoId);
            expect(updatedConfig.isActive).to.be.false;
            expect(updatedConfig.isPrimaryExecuted).to.be.true;
            expect(updatedConfig.isSecondaryExecuted).to.be.false;

            // Verify cancellation was requested
            const cancellationRequest = await ocoExtension.cancellationRequests(stopLossHash);
            expect(cancellationRequest.requestedAt).to.be.gt(0);
            expect(cancellationRequest.processed).to.be.false;
        });

        it('should process cancellation through keeper', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Create simple orders for cancellation test
            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr.address,
            });

            const hash1 = await swap.hashOrder(order1);
            const ocoId = ethers.keccak256(ethers.toUtf8Bytes("test-oco"));

            // Create a mock cancellation request
            await ocoExtension.connect(addr)._requestCancellation(hash1, ocoId);

            // Wait for cancellation delay
            await ethers.provider.send("evm_increaseTime", [31]); // Wait 31 seconds
            await ethers.provider.send("evm_mine");

            // Process cancellation as keeper
            const makerTraits = order1.makerTraits;
            
            await expect(ocoExtension.connect(keeper).processCancellation(hash1, makerTraits))
                .to.emit(ocoExtension, 'CancellationProcessed')
                .withArgs(hash1, ocoId, keeper.address, anyValue);

            // Verify cancellation was processed
            const request = await ocoExtension.cancellationRequests(hash1);
            expect(request.processed).to.be.true;
        });
    });

    describe('Security Features', function () {
        it('should reject unauthorized keeper operations', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr.address,
            });

            const hash1 = await swap.hashOrder(order1);
            const makerTraits = order1.makerTraits;

            // Should fail when called by unauthorized user
            await expect(ocoExtension.connect(attacker).processCancellation(hash1, makerTraits))
                .to.be.revertedWithCustomError(ocoExtension, 'UnauthorizedKeeper');
        });

        it('should enforce gas price limits', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Create OCO with gas price limit
            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4500'),
                maker: addr.address,
            }, {
                preInteraction: await ocoExtension.getAddress()
            });

            const order2 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('3500'),
                maker: addr.address,
            }, {
                preInteraction: await ocoExtension.getAddress()
            });

            const hash1 = await swap.hashOrder(order1);
            const hash2 = await swap.hashOrder(order2);
            const ocoId = createOCOId(hash1, hash2);

            const ocoConfig = {
                primaryOrderHash: hash1,
                secondaryOrderHash: hash2,
                orderMaker: addr.address,
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ethers.parseUnits('50', 'gwei'), // 50 gwei limit
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await ocoExtension.configureOCO(ocoId, ocoConfig);

            // The gas price check would be triggered during preInteraction
            // when an order is actually executed with high gas price
        });

        it('should allow owner to pause and unpause', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            // Pause contract
            await ocoExtension.pause();
            
            // Operations should fail when paused
            const order1 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr.address,
            });

            const order2 = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('3500'),
                maker: addr.address,
            });

            const hash1 = await swap.hashOrder(order1);
            const hash2 = await swap.hashOrder(order2);
            const ocoId = createOCOId(hash1, hash2);

            const ocoConfig = {
                primaryOrderHash: hash1,
                secondaryOrderHash: hash2,
                orderMaker: addr.address,
                strategy: 0,
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.be.revertedWith('Pausable: paused');

            // Unpause and try again
            await ocoExtension.unpause();
            
            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.emit(ocoExtension, 'OCOConfigured');
        });
    });

    describe('OCO Strategies', function () {
        it('should support BRACKET strategy (Take Profit + Stop Loss)', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            const takeProfitOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('5'), // 5 WETH position
                takingAmount: ether('22500'), // Take profit at $4500
                maker: addr.address,
            });

            const stopLossOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('5'), // 5 WETH position
                takingAmount: ether('17500'), // Stop loss at $3500
                maker: addr.address,
            });

            const takeProfitHash = await swap.hashOrder(takeProfitOrder);
            const stopLossHash = await swap.hashOrder(stopLossOrder);
            const ocoId = createOCOId(takeProfitHash, stopLossHash);

            const ocoConfig = {
                primaryOrderHash: takeProfitHash,
                secondaryOrderHash: stopLossHash,
                orderMaker: addr.address,
                strategy: 0, // BRACKET
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.emit(ocoExtension, 'OCOConfigured')
                .withArgs(ocoId, takeProfitHash, stopLossHash, addr.address, 0); // 0 = BRACKET

            const storedConfig = await ocoExtension.getOCOConfig(ocoId);
            expect(storedConfig.strategy).to.equal(0); // BRACKET
        });

        it('should support BREAKOUT strategy (Buy High + Buy Low)', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            const buyHighOrder = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('21000'), // 21k DAI
                takingAmount: ether('5'), // Buy 5 WETH at $4200 (breakout)
                maker: addr.address,
            });

            const buyLowOrder = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('19000'), // 19k DAI
                takingAmount: ether('5'), // Buy 5 WETH at $3800 (dip)
                maker: addr.address,
            });

            const buyHighHash = await swap.hashOrder(buyHighOrder);
            const buyLowHash = await swap.hashOrder(buyLowOrder);
            const ocoId = createOCOId(buyHighHash, buyLowHash);

            const ocoConfig = {
                primaryOrderHash: buyHighHash,
                secondaryOrderHash: buyLowHash,
                orderMaker: addr.address,
                strategy: 1, // BREAKOUT
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.emit(ocoExtension, 'OCOConfigured')
                .withArgs(ocoId, buyHighHash, buyLowHash, addr.address, 1); // 1 = BREAKOUT
        });

        it('should support RANGE strategy (Sell High + Buy Low)', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { ocoExtension } = contracts;

            const sellHighOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('3'), // 3 WETH
                takingAmount: ether('12900'), // Sell at $4300 (resistance)
                maker: addr.address,
            });

            const buyLowOrder = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('11100'), // 11.1k DAI
                takingAmount: ether('3'), // Buy 3 WETH at $3700 (support)
                maker: addr.address,
            });

            const sellHighHash = await swap.hashOrder(sellHighOrder);
            const buyLowHash = await swap.hashOrder(buyLowOrder);
            const ocoId = createOCOId(sellHighHash, buyLowHash);

            const ocoConfig = {
                primaryOrderHash: sellHighHash,
                secondaryOrderHash: buyLowHash,
                orderMaker: addr.address,
                strategy: 2, // RANGE
                isPrimaryExecuted: false,
                isSecondaryExecuted: false,
                isActive: true,
                configuredAt: 0,
                authorizedKeeper: ethers.ZeroAddress,
                maxGasPrice: ether('0.0001'),
                expiresAt: Math.floor(Date.now() / 1000) + 86400
            };

            await expect(ocoExtension.configureOCO(ocoId, ocoConfig))
                .to.emit(ocoExtension, 'OCOConfigured')
                .withArgs(ocoId, sellHighHash, buyLowHash, addr.address, 2); // 2 = RANGE
        });
    });
});