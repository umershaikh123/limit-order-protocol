const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');

describe('StopLossMarketOrder', function () {
    let addr, addr1, keeper;
    let dai, weth, inch, swap, chainId;
    let stopLossExtension, stopLossKeeper;
    let daiOracle, wethOracle, inchOracle;
    let aggregationRouter;

    before(async function () {
        [addr, addr1, keeper] = await ethers.getSigners();
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

        // Deploy price oracles
        const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
        daiOracle = await AggregatorMock.deploy(ether('0.00025')); // 1 DAI = 0.00025 ETH
        await daiOracle.waitForDeployment();
        wethOracle = await AggregatorMock.deploy(ether('1')); // 1 WETH = 1 ETH
        await wethOracle.waitForDeployment();
        inchOracle = await AggregatorMock.deploy('1577615249227853'); // ~0.00157 ETH
        await inchOracle.waitForDeployment();

        // Deploy mock aggregation router
        const MockAggregationRouter = await ethers.getContractFactory('MockAggregationRouter');
        aggregationRouter = await MockAggregationRouter.deploy();
        await aggregationRouter.waitForDeployment();

        // Deploy StopLossMarketOrder extension
        const StopLossMarketOrder = await ethers.getContractFactory('StopLossMarketOrder');
        stopLossExtension = await StopLossMarketOrder.deploy(
            await aggregationRouter.getAddress(),
            await swap.getAddress()
        );

        // Deploy StopLossKeeper
        const StopLossKeeper = await ethers.getContractFactory('StopLossKeeper');
        stopLossKeeper = await StopLossKeeper.deploy(
            await swap.getAddress(),
            await stopLossExtension.getAddress()
        );

        // Fund keeper with ETH for rewards
        await addr.sendTransaction({
            to: await stopLossKeeper.getAddress(),
            value: ether('10')
        });

        return {
            dai, weth, inch, swap, chainId,
            stopLossExtension, stopLossKeeper,
            daiOracle, wethOracle, inchOracle,
            aggregationRouter
        };
    }

    describe('Stop Loss Configuration', function () {
        it('should configure stop loss order correctly', async function () {
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
            const stopPrice = ether('3800'); // Stop at 3800 DAI per ETH

            await expect(
                stopLossExtension.configureStopLoss(orderHash, {
                    makerAssetOracle: await wethOracle.getAddress(),
                    takerAssetOracle: await daiOracle.getAddress(),
                    stopPrice: stopPrice,
                    maxSlippage: 100, // 1% slippage
                    isStopLoss: true,
                    keeper: keeper.address
                })
            ).to.emit(stopLossExtension, 'StopLossConfigured')
                .withArgs(
                    orderHash,
                    await wethOracle.getAddress(),
                    await daiOracle.getAddress(),
                    stopPrice,
                    true
                );
        });

        it('should reject invalid oracle configuration', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension } = contracts;

            const orderHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

            await expect(
                stopLossExtension.configureStopLoss(orderHash, {
                    makerAssetOracle: ethers.ZeroAddress,
                    takerAssetOracle: await daiOracle.getAddress(),
                    stopPrice: ether('3800'),
                    maxSlippage: 100,
                    isStopLoss: true,
                    keeper: keeper.address
                })
            ).to.be.revertedWithCustomError(stopLossExtension, 'InvalidOracle');
        });
    });

    describe('Stop Loss Trigger Detection', function () {
        it('should detect when stop loss is triggered', async function () {
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
            const stopPrice = ether('3800'); // Stop at 3800 DAI per ETH

            // Configure stop loss
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: stopPrice,
                maxSlippage: 100,
                isStopLoss: true,
                keeper: ethers.ZeroAddress
            });

            // Current price is 4000 DAI per ETH (not triggered)
            let [triggered, currentPrice] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.false;
            expect(currentPrice).to.be.closeTo(ether('4000'), ether('1'));

            // Update oracle price to trigger stop loss
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const newDaiOracle = await AggregatorMock.deploy(ether('0.000277')); // 1 DAI = 0.000277 ETH (3610 DAI per ETH)
            
            // Reconfigure with new oracle
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await newDaiOracle.getAddress(),
                stopPrice: stopPrice,
                maxSlippage: 100,
                isStopLoss: true,
                keeper: ethers.ZeroAddress
            });

            [triggered, currentPrice] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.true;
            expect(currentPrice).to.be.closeTo(ether('3610'), ether('10'));
        });

        it('should detect take profit trigger', async function () {
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
            const takeProfitPrice = ether('4500'); // Take profit at 4500 DAI per ETH

            // Configure take profit
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: takeProfitPrice,
                maxSlippage: 100,
                isStopLoss: false, // Take profit
                keeper: ethers.ZeroAddress
            });

            // Current price is 4000 DAI per ETH (not triggered)
            let [triggered] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.false;

            // Update oracle price to trigger take profit
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const newDaiOracle = await AggregatorMock.deploy(ether('0.00022')); // 1 DAI = 0.00022 ETH (4545 DAI per ETH)
            
            // Reconfigure with new oracle
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await newDaiOracle.getAddress(),
                stopPrice: takeProfitPrice,
                maxSlippage: 100,
                isStopLoss: false,
                keeper: ethers.ZeroAddress
            });

            [triggered] = await stopLossExtension.isStopLossTriggered(orderHash);
            expect(triggered).to.be.true;
        });
    });

    describe('Keeper Operations', function () {
        it('should add order to keeper monitoring', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, stopLossKeeper, daiOracle, wethOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);

            // Configure stop loss first
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await daiOracle.getAddress(),
                stopPrice: ether('3800'),
                maxSlippage: 100,
                isStopLoss: true,
                keeper: keeper.address
            });

            // Add order to keeper
            await expect(
                stopLossKeeper.addOrder(order, signature, '0x')
            ).to.emit(stopLossKeeper, 'OrderAdded')
                .withArgs(orderHash, addr1.address);

            // Check active orders
            const activeOrders = await stopLossKeeper.getActiveOrders();
            expect(activeOrders).to.have.lengthOf(1);
            expect(activeOrders[0]).to.equal(orderHash);
        });

        it('should detect orders needing execution', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, stopLossKeeper, wethOracle } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);

            // Deploy oracle with price that triggers stop loss
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const triggeredDaiOracle = await AggregatorMock.deploy(ether('0.000277')); // 3610 DAI per ETH

            // Configure stop loss
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await triggeredDaiOracle.getAddress(),
                stopPrice: ether('3800'),
                maxSlippage: 100,
                isStopLoss: true,
                keeper: ethers.ZeroAddress
            });

            // Add order to keeper
            await stopLossKeeper.addOrder(order, signature, '0x');

            // Check upkeep
            const [upkeepNeeded, performData] = await stopLossKeeper.checkUpkeep('0x');
            expect(upkeepNeeded).to.be.true;

            const ordersToExecute = ethers.AbiCoder.defaultAbiCoder().decode(['bytes32[]'], performData)[0];
            expect(ordersToExecute).to.have.lengthOf(1);
            expect(ordersToExecute[0]).to.equal(orderHash);
        });

        it('should handle keeper rewards', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossKeeper } = contracts;

            // Update keeper reward
            const newReward = ether('0.005');
            await expect(
                stopLossKeeper.updateKeeperReward(newReward)
            ).to.emit(stopLossKeeper, 'KeeperRewardUpdated')
                .withArgs(newReward);

            expect(await stopLossKeeper.keeperReward()).to.equal(newReward);
        });
    });

    describe('Integration Test', function () {
        it('should execute complete stop loss flow', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { stopLossExtension, wethOracle, dai, weth } = contracts;

            // Create order with stop loss pre-interaction
            const stopLossExtensionAddress = await stopLossExtension.getAddress();
            const order = buildOrder(
                {
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('1'),
                    takingAmount: ether('3600'), // Expecting ~3600 DAI
                    maker: addr1.address,
                },
                {
                    preInteraction: stopLossExtensionAddress,
                    postInteraction: stopLossExtensionAddress
                }
            );

            const orderHash = await swap.hashOrder(order);
            
            // Deploy oracle with triggered price
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const triggeredDaiOracle = await AggregatorMock.deploy(ether('0.000277')); // 3610 DAI per ETH

            // Configure stop loss
            await stopLossExtension.configureStopLoss(orderHash, {
                makerAssetOracle: await wethOracle.getAddress(),
                takerAssetOracle: await triggeredDaiOracle.getAddress(),
                stopPrice: ether('3800'),
                maxSlippage: 200, // 2% slippage
                isStopLoss: true,
                keeper: keeper.address
            });

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);

            // Mock aggregation router to simulate market swap
            await aggregationRouter.setMockSwapRate(await weth.getAddress(), await dai.getAddress(), ether('3600'));
            
            // Prepare swap data for aggregation router
            const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'address', 'uint256'],
                [await weth.getAddress(), await dai.getAddress(), ether('3600')]
            );

            const takerTraits = buildTakerTraits({
                extension: order.extension,
                interaction: swapData
            });

            // Execute stop loss order as keeper
            await expect(
                swap.connect(keeper).fillOrderArgs(
                    order,
                    r,
                    vs,
                    ether('1'),
                    takerTraits.traits,
                    takerTraits.args
                )
            ).to.emit(stopLossExtension, 'StopLossTriggered');
        });
    });
});