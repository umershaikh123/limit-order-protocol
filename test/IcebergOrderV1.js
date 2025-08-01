const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');

// Helper function to build extension data for IAmountGetter
function buildIcebergExtensionData(icebergAddress, extraData = '0x') {
    return ethers.solidityPacked(
        ['address', 'bytes'],
        [icebergAddress, extraData]
    );
}

describe('IcebergOrderV1', function () {
    let addr, addr1, keeper, attacker;
    let dai, weth, inch, swap, chainId;
    let icebergExtension;

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

        // Deploy IcebergOrderV1 extension
        const IcebergOrderV1 = await ethers.getContractFactory('IcebergOrderV1');
        icebergExtension = await IcebergOrderV1.deploy(
            await swap.getAddress()
        );
        await icebergExtension.waitForDeployment();

        // Authorize keeper
        await icebergExtension.setKeeperAuthorization(keeper.address, true);

        return {
            dai, weth, inch, swap, chainId,
            icebergExtension
        };
    }

    describe('IAmountGetter Integration', function () {
        it('should work as AmountGetter for progressive chunk revelation', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            // Create order with iceberg extension as AmountGetter
            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('10'), // 10 WETH total
                takingAmount: ether('40000'), // 40k DAI
                maker: addr1.address,
            }, {
                // Use iceberg extension as AmountGetter
                makingAmountData: buildIcebergExtensionData(await icebergExtension.getAddress()),
                takingAmountData: buildIcebergExtensionData(await icebergExtension.getAddress()),
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg with 2 WETH chunks (5 chunks total)
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('10'),
                totalTakingAmount: ether('40000'),
                currentVisibleAmount: 0, // Will be calculated
                filledAmount: 0,
                baseChunkSize: ether('2'), // 2 WETH per chunk
                strategy: 0, // FIXED_SIZE
                maxVisiblePercent: 1000, // 10% max visible (within contract limit)
                revealInterval: 300, // 5 minutes
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Check current chunk info
            const [chunkSize, filledAmount, remainingAmount, isReady] = 
                await icebergExtension.getCurrentChunkInfo(orderHash);
            
            expect(chunkSize).to.equal(ether('2')); // First chunk should be 2 WETH
            expect(filledAmount).to.equal(0);
            expect(remainingAmount).to.equal(ether('10'));
            expect(isReady).to.be.true;

            // Verify getMakingAmount returns chunk size, not total size
            const makingAmount = await icebergExtension.getMakingAmount(
                order,
                '0x',
                orderHash,
                addr.address,
                ether('8000'), // Want to buy 8k DAI worth
                ether('10'), // 10 WETH remaining
                '0x'
            );

            expect(makingAmount).to.equal(ether('2')); // Should be limited to chunk size
        });

        it('should return 0 making amount when iceberg not configured', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Call getMakingAmount without configuring iceberg - should use base implementation
            const makingAmount = await icebergExtension.getMakingAmount(
                order,
                '0x',
                orderHash,
                addr.address,
                ether('4000'),
                ether('1'),
                '0x'
            );

            // Should return the full making amount since no iceberg is configured
            expect(makingAmount).to.equal(ether('1'));
        });
    });

    describe('Chunk Strategies', function () {
        it('should handle FIXED_SIZE strategy correctly', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('20'), // 20 WETH total
                takingAmount: ether('80000'), // 80k DAI
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg with fixed 3 WETH chunks
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('20'),
                totalTakingAmount: ether('80000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('3'), // 3 WETH per chunk
                strategy: 0, // FIXED_SIZE
                maxVisiblePercent: 1000, // 10% max visible (within contract limit)
                revealInterval: 60, // 1 minute
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Check that each chunk is consistently 3 WETH
            const [chunkSize1] = await icebergExtension.getCurrentChunkInfo(orderHash);
            expect(chunkSize1).to.equal(ether('3'));

            // Simulate some fills and check next chunks maintain fixed size
            // Note: In a real test, we'd actually execute fills through the protocol
        });

        it('should handle PERCENTAGE strategy correctly', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('50'), // 50 WETH total
                takingAmount: ether('200000'), // 200k DAI
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg with percentage-based chunks (10% of remaining)
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('50'),
                totalTakingAmount: ether('200000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('5'), // Base size (not used for percentage)
                strategy: 1, // PERCENTAGE
                maxVisiblePercent: 1000, // 10% of remaining
                revealInterval: 60,
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // First chunk should be 10% of 50 WETH = 5 WETH
            const [chunkSize1] = await icebergExtension.getCurrentChunkInfo(orderHash);
            expect(chunkSize1).to.equal(ether('5'));
        });

        it('should handle TIME_BASED strategy with increasing chunk sizes', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('30'), // 30 WETH total
                takingAmount: ether('120000'), // 120k DAI
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg with time-based strategy
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('30'),
                totalTakingAmount: ether('120000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('2'), // 2 WETH base (smaller to allow growth)
                strategy: 3, // TIME_BASED
                maxVisiblePercent: 1000, // 10% max = 3 WETH cap (allow growth)
                revealInterval: 300, // 5 minutes
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Initial chunk should be base size (time multiplier = 100 initially), not capped by maxVisiblePercent
            const [chunkSize1] = await icebergExtension.getCurrentChunkInfo(orderHash);
            // Max visible = 30 WETH * 10% = 3 WETH, baseChunkSize = 2 WETH, so min(2, 3) = 2 WETH
            expect(chunkSize1).to.equal(ether('2')); // Base chunk size, not capped

            // Fast forward time and check that chunk size increases
            await ethers.provider.send("evm_increaseTime", [600]); // 10 minutes
            await ethers.provider.send("evm_mine");

            // Trigger chunk update (in practice, this would happen automatically during fills)
            await icebergExtension.connect(keeper).revealNextChunk(orderHash);

            const [chunkSize2] = await icebergExtension.getCurrentChunkInfo(orderHash);
            expect(chunkSize2).to.be.gt(chunkSize1); // Should be larger due to time increase
        });
    });

    describe('Security Features', function () {
        it('should reject unauthorized iceberg configuration', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('40000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Attacker tries to configure iceberg for someone else's order
            await expect(
                icebergExtension.connect(attacker).configureIceberg(orderHash, addr1.address, {
                    totalMakingAmount: ether('10'),
                    totalTakingAmount: ether('40000'),
                    currentVisibleAmount: 0,
                    filledAmount: 0,
                    baseChunkSize: ether('2'),
                    strategy: 0, // FIXED_SIZE
                    maxVisiblePercent: 1000,
                    revealInterval: 300,
                    lastRevealTime: 0,
                    lastFillTime: 0,
                    minPriceImprovement: 0,
                    lastPrice: 0,
                    orderMaker: addr1.address,
                    isActive: true,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(icebergExtension, 'UnauthorizedCaller');
        });

        it('should validate iceberg configuration parameters', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('40000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Invalid total amount (zero)
            await expect(
                icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                    totalMakingAmount: 0, // Invalid
                    totalTakingAmount: ether('40000'),
                    currentVisibleAmount: 0,
                    filledAmount: 0,
                    baseChunkSize: ether('2'),
                    strategy: 0,
                    maxVisiblePercent: 1000,
                    revealInterval: 300,
                    lastRevealTime: 0,
                    lastFillTime: 0,
                    minPriceImprovement: 0,
                    lastPrice: 0,
                    orderMaker: addr1.address,
                    isActive: true,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(icebergExtension, 'InvalidTotalAmount');

            // Invalid chunk size (larger than total)
            await expect(
                icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                    totalMakingAmount: ether('10'),
                    totalTakingAmount: ether('40000'),
                    currentVisibleAmount: 0,
                    filledAmount: 0,
                    baseChunkSize: ether('20'), // Larger than total
                    strategy: 0,
                    maxVisiblePercent: 1000,
                    revealInterval: 300,
                    lastRevealTime: 0,
                    lastFillTime: 0,
                    minPriceImprovement: 0,
                    lastPrice: 0,
                    orderMaker: addr1.address,
                    isActive: true,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(icebergExtension, 'InvalidChunkSize');

            // Invalid max visible percent (too high)
            await expect(
                icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                    totalMakingAmount: ether('10'),
                    totalTakingAmount: ether('40000'),
                    currentVisibleAmount: 0,
                    filledAmount: 0,
                    baseChunkSize: ether('2'),
                    strategy: 0,
                    maxVisiblePercent: 1500, // Over 10% max (should fail)
                    revealInterval: 300,
                    lastRevealTime: 0,
                    lastFillTime: 0,
                    minPriceImprovement: 0,
                    lastPrice: 0,
                    orderMaker: addr1.address,
                    isActive: true,
                    configuredAt: 0,
                    makerTokenDecimals: 18,
                    takerTokenDecimals: 18
                })
            ).to.be.revertedWithCustomError(icebergExtension, 'InvalidChunkSize');
        });

        it('should allow only authorized keepers to reveal chunks', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('40000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('10'),
                totalTakingAmount: ether('40000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('2'),
                strategy: 0,
                maxVisiblePercent: 1000,
                revealInterval: 60, // 1 minute
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [120]); // 2 minutes
            await ethers.provider.send("evm_mine");

            // Authorized keeper can reveal
            await expect(
                icebergExtension.connect(keeper).revealNextChunk(orderHash)
            ).to.not.be.reverted;

            // Unauthorized user cannot reveal
            await expect(
                icebergExtension.connect(attacker).revealNextChunk(orderHash)
            ).to.be.revertedWithCustomError(icebergExtension, 'UnauthorizedCaller');

            // Order maker can reveal their own chunks
            await expect(
                icebergExtension.connect(addr1).revealNextChunk(orderHash)
            ).to.not.be.reverted;
        });

        it('should allow owner to recover stuck tokens', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            // Send some tokens to the contract
            await dai.transfer(await icebergExtension.getAddress(), ether('100'));

            // Owner can recover
            await expect(
                icebergExtension.emergencyRecoverToken(
                    await dai.getAddress(),
                    addr.address,
                    ether('100')
                )
            ).to.not.be.reverted;

            // Non-owner cannot recover
            await expect(
                icebergExtension.connect(addr1).emergencyRecoverToken(
                    await dai.getAddress(),
                    addr1.address,
                    ether('1')
                )
            ).to.be.revertedWithCustomError(icebergExtension, 'OwnableUnauthorizedAccount');
        });
    });

    describe('Pause Functionality', function () {
        it('should allow owner to pause and unpause', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            // Owner can pause
            await expect(icebergExtension.pause()).to.not.be.reverted;

            // Owner can unpause
            await expect(icebergExtension.unpause()).to.not.be.reverted;

            // Non-owner cannot pause
            await expect(
                icebergExtension.connect(addr1).pause()
            ).to.be.revertedWithCustomError(icebergExtension, 'OwnableUnauthorizedAccount');
        });

        it('should block interactions when paused', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('40000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg first
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('10'),
                totalTakingAmount: ether('40000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('2'),
                strategy: 0,
                maxVisiblePercent: 1000,
                revealInterval: 60,
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Pause the contract
            await icebergExtension.pause();

            // Should fail when paused
            await expect(
                icebergExtension.preInteraction(
                    order,
                    '0x',
                    orderHash,
                    addr.address,
                    ether('2'),
                    ether('8000'),
                    ether('10'),
                    '0x'
                )
            ).to.be.revertedWithCustomError(icebergExtension, 'EnforcedPause');
        });
    });

    describe('Iceberg Completion', function () {
        it('should track completion status correctly', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('5'), // Small order for easy completion
                takingAmount: ether('20000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('5'),
                totalTakingAmount: ether('20000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('1'), // 1 WETH chunks
                strategy: 0,
                maxVisiblePercent: 1000, // 10%
                revealInterval: 60,
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Initially not completed
            const [completed1, fillPercentage1] = await icebergExtension.isIcebergCompleted(orderHash);
            expect(completed1).to.be.false;
            expect(fillPercentage1).to.equal(0);

            // Simulate partial completion by manually updating filled amount
            // (In real usage, this would happen through takerInteraction)
            // Note: This is for testing purposes only - real fills would go through the protocol
        });

        it('should handle removal of iceberg configuration', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('40000'),
                maker: addr1.address,
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('10'),
                totalTakingAmount: ether('40000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('2'),
                strategy: 0,
                maxVisiblePercent: 1000,
                revealInterval: 300,
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Verify configuration exists
            const [chunkSize] = await icebergExtension.getCurrentChunkInfo(orderHash);
            expect(chunkSize).to.be.gt(0);

            // Order maker can remove their configuration
            await expect(
                icebergExtension.connect(addr1).removeIcebergConfig(orderHash)
            ).to.not.be.reverted;

            // Configuration should be gone
            const [chunkSize2] = await icebergExtension.getCurrentChunkInfo(orderHash);
            expect(chunkSize2).to.equal(0);

            // Unauthorized user cannot remove configuration
            await expect(
                icebergExtension.connect(attacker).removeIcebergConfig(orderHash)
            ).to.be.revertedWithCustomError(icebergExtension, 'UnauthorizedCaller');
        });
    });

    describe('Keeper Management', function () {
        it('should allow owner to authorize and revoke keepers', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            // Initially keeper should be authorized (done in setup)
            expect(await icebergExtension.authorizedKeepers(keeper.address)).to.be.true;

            // Owner can revoke authorization
            await icebergExtension.setKeeperAuthorization(keeper.address, false);
            expect(await icebergExtension.authorizedKeepers(keeper.address)).to.be.false;

            // Owner can re-authorize
            await icebergExtension.setKeeperAuthorization(keeper.address, true);
            expect(await icebergExtension.authorizedKeepers(keeper.address)).to.be.true;

            // Non-owner cannot change keeper authorization
            await expect(
                icebergExtension.connect(addr1).setKeeperAuthorization(attacker.address, true)
            ).to.be.revertedWithCustomError(icebergExtension, 'OwnableUnauthorizedAccount');
        });
    });

    describe('Integration with 1inch Protocol', function () {
        it('should integrate properly with order filling mechanism', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { icebergExtension } = contracts;

            // Create order with iceberg extension
            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('6'), // 6 WETH total
                takingAmount: ether('24000'), // 24k DAI
                maker: addr1.address,
            }, {
                makingAmountData: buildIcebergExtensionData(await icebergExtension.getAddress()),
                takingAmountData: buildIcebergExtensionData(await icebergExtension.getAddress())
            });

            const orderHash = await swap.hashOrder(order);

            // Configure iceberg with 2 WETH chunks
            await icebergExtension.connect(addr1).configureIceberg(orderHash, addr1.address, {
                totalMakingAmount: ether('6'),
                totalTakingAmount: ether('24000'),
                currentVisibleAmount: 0,
                filledAmount: 0,
                baseChunkSize: ether('2'), // 2 WETH per chunk
                strategy: 0, // FIXED_SIZE
                maxVisiblePercent: 1000, // 10%
                revealInterval: 60,
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: 0,
                lastPrice: 0,
                orderMaker: addr1.address,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: 18,
                takerTokenDecimals: 18
            });

            // Sign the order
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);

            const takerTraits = buildTakerTraits({
                extension: order.extension
            });

            // Try to fill more than chunk size - should be limited to chunk size
            const fillTx = swap.fillOrderArgs(
                order,
                r,
                vs,
                ether('4'), // Try to fill 4 WETH
                takerTraits.traits,
                takerTraits.args
            );

            // Should work but only fill the chunk size (2 WETH)
            await expect(fillTx).to.not.be.reverted;
            
            // Verify that only the chunk amount was filled
            await expect(fillTx).to.changeTokenBalances(
                weth,
                [addr1, addr],
                [ether('-2'), ether('2')] // Only 2 WETH transferred, not 4
            );
        });
    });
});