/**
 * @title Iceberg Order Example
 * @notice Comprehensive example showing how to create and manage iceberg orders
 * @dev This example demonstrates the complete lifecycle of an iceberg order
 */

const { ethers } = require("hardhat");
const {
    signOrder,
    buildOrder,
    buildTakerTraits,
} = require("../test/helpers/orderUtils");

class IcebergOrderManager {
    constructor(limitOrderProtocol, icebergExtension, keeper, signer) {
        this.limitOrderProtocol = limitOrderProtocol;
        this.icebergExtension = icebergExtension;
        this.keeper = keeper;
        this.signer = signer;
        this.chainId = null;
    }

    async initialize() {
        const network = await ethers.provider.getNetwork();
        this.chainId = network.chainId;
        console.log(
            "🚀 Iceberg Order Manager initialized on chain:",
            this.chainId
        );
    }

    /**
     * Create a new iceberg order
     * @param {Object} orderParams - Order parameters
     * @param {Object} icebergConfig - Iceberg configuration
     * @returns {Object} Created order and hash
     */
    async createIcebergOrder(orderParams, icebergConfig) {
        console.log("📊 Creating Iceberg Order...");
        console.log(
            "Total Amount:",
            ethers.formatEther(orderParams.makingAmount),
            "WETH"
        );
        console.log(
            "Chunk Size:",
            ethers.formatEther(icebergConfig.baseChunkSize),
            "WETH"
        );
        console.log("Strategy:", this._getStrategyName(icebergConfig.strategy));

        // 1. Build the order with iceberg extension
        const order = buildOrder(
            {
                makerAsset: orderParams.makerAsset,
                takerAsset: orderParams.takerAsset,
                makingAmount: orderParams.makingAmount,
                takingAmount: orderParams.takingAmount,
                maker: orderParams.maker,
            },
            {
                // Use iceberg extension as AmountGetter
                makingAmountData: ethers.solidityPacked(
                    ["address", "bytes"],
                    [await this.icebergExtension.getAddress(), "0x"]
                ),
                takingAmountData: ethers.solidityPacked(
                    ["address", "bytes"],
                    [await this.icebergExtension.getAddress(), "0x"]
                ),
            }
        );

        // 2. Calculate order hash
        const orderHash = await this.limitOrderProtocol.hashOrder(order);
        console.log("📝 Order Hash:", orderHash);

        // 3. Configure iceberg parameters
        await this.icebergExtension.configureIceberg(
            orderHash,
            orderParams.maker,
            {
                totalMakingAmount: icebergConfig.totalMakingAmount,
                totalTakingAmount: icebergConfig.totalTakingAmount,
                currentVisibleAmount: 0, // Will be calculated
                filledAmount: 0,
                baseChunkSize: icebergConfig.baseChunkSize,
                strategy: icebergConfig.strategy,
                maxVisiblePercent: icebergConfig.maxVisiblePercent,
                revealInterval: icebergConfig.revealInterval,
                lastRevealTime: 0,
                lastFillTime: 0,
                minPriceImprovement: icebergConfig.minPriceImprovement || 0,
                lastPrice: 0,
                orderMaker: orderParams.maker,
                isActive: true,
                configuredAt: 0,
                makerTokenDecimals: icebergConfig.makerTokenDecimals || 18,
                takerTokenDecimals: icebergConfig.takerTokenDecimals || 18,
            }
        );

        console.log("⚙️ Iceberg configured successfully");

        // 4. Sign the order
        const signature = await signOrder(
            order,
            this.chainId,
            await this.limitOrderProtocol.getAddress(),
            this.signer
        );
        console.log("✍️ Order signed");

        // 5. Register with keeper for automation
        if (this.keeper) {
            const expirationTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours
            await this.keeper.registerOrder(order, signature, expirationTime);
            console.log("🤖 Order registered with keeper for automation");
        }

        return { order, orderHash, signature };
    }

    /**
     * Monitor an iceberg order's progress
     * @param {string} orderHash - The order hash to monitor
     */
    async monitorOrder(orderHash) {
        console.log("👁️ Monitoring Iceberg Order:", orderHash);

        const [chunkSize, filledAmount, remainingAmount, isReady] =
            await this.icebergExtension.getCurrentChunkInfo(orderHash);

        const [completed, fillPercentage] =
            await this.icebergExtension.isIcebergCompleted(orderHash);

        console.log("📊 Current Status:");
        console.log("  Current Chunk:", ethers.formatEther(chunkSize), "WETH");
        console.log(
            "  Filled Amount:",
            ethers.formatEther(filledAmount),
            "WETH"
        );
        console.log(
            "  Remaining:",
            ethers.formatEther(remainingAmount),
            "WETH"
        );
        console.log(
            "  Fill Percentage:",
            (Number(fillPercentage) / 100).toFixed(2) + "%"
        );
        console.log("  Is Ready:", isReady);
        console.log("  Is Completed:", completed);

        return {
            chunkSize,
            filledAmount,
            remainingAmount,
            isReady,
            completed,
            fillPercentage,
        };
    }

    /**
     * Manually reveal the next chunk
     * @param {string} orderHash - The order hash
     */
    async revealNextChunk(orderHash) {
        console.log("🔄 Revealing next chunk for order:", orderHash);

        try {
            const tx = await this.icebergExtension.revealNextChunk(orderHash);
            await tx.wait();
            console.log("✅ Next chunk revealed successfully");

            // Show updated status
            await this.monitorOrder(orderHash);
        } catch (error) {
            console.error("❌ Failed to reveal next chunk:", error.message);
        }
    }

    /**
     * Execute a partial fill of the current chunk
     * @param {Object} order - The order object
     * @param {string} signature - The order signature
     * @param {string} fillAmount - Amount to fill
     */
    async executePartialFill(order, signature, fillAmount) {
        console.log(
            "⚡ Executing partial fill:",
            ethers.formatEther(fillAmount),
            "WETH"
        );

        try {
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);

            const takerTraits = buildTakerTraits({
                extension: order.extension,
            });

            const tx = await this.limitOrderProtocol.fillOrderArgs(
                order,
                r,
                vs,
                fillAmount,
                takerTraits.traits,
                takerTraits.args
            );

            const receipt = await tx.wait();
            console.log("✅ Fill executed successfully");
            console.log("📋 Transaction Hash:", receipt.hash);
            console.log("⛽ Gas Used:", receipt.gasUsed.toString());

            return receipt;
        } catch (error) {
            console.error("❌ Fill execution failed:", error.message);
            throw error;
        }
    }

    /**
     * Get keeper upkeep status
     */
    async checkKeeperUpkeep() {
        if (!this.keeper) {
            console.log("❌ No keeper configured");
            return { upkeepNeeded: false, performData: "0x" };
        }

        console.log("🤖 Checking keeper upkeep status...");

        const [upkeepNeeded, performData] = await this.keeper.checkUpkeep("0x");

        console.log("📊 Upkeep Status:");
        console.log("  Upkeep Needed:", upkeepNeeded);
        console.log("  Orders Needing Action:", upkeepNeeded ? "Yes" : "None");

        return { upkeepNeeded, performData };
    }

    /**
     * Perform keeper upkeep
     * @param {string} performData - Data from checkUpkeep
     */
    async performKeeperUpkeep(performData) {
        if (!this.keeper) {
            console.log("❌ No keeper configured");
            return;
        }

        console.log("🔄 Performing keeper upkeep...");

        try {
            const tx = await this.keeper.performUpkeep(performData);
            await tx.wait();
            console.log("✅ Keeper upkeep completed successfully");
        } catch (error) {
            console.error("❌ Keeper upkeep failed:", error.message);
        }
    }

    /**
     * Create different types of iceberg orders
     */
    async createExampleOrders(makerAsset, takerAsset, maker) {
        console.log("\n🏗️ Creating Example Iceberg Orders...\n");

        // 1. Fixed Size Strategy - Conservative Trading
        console.log("1️⃣ FIXED SIZE STRATEGY (Conservative)");
        const fixedSizeOrder = await this.createIcebergOrder(
            {
                makerAsset,
                takerAsset,
                makingAmount: ethers.parseEther("20"), // 20 WETH total
                takingAmount: ethers.parseEther("80000"), // 80k DAI
                maker,
            },
            {
                totalMakingAmount: ethers.parseEther("20"),
                totalTakingAmount: ethers.parseEther("80000"),
                baseChunkSize: ethers.parseEther("2"), // 2 WETH chunks
                strategy: 0, // FIXED_SIZE
                maxVisiblePercent: 1000, // 10% max visible
                revealInterval: 300, // 5 minutes between reveals
            }
        );

        // 2. Percentage Strategy - Dynamic Sizing
        console.log("\n2️⃣ PERCENTAGE STRATEGY (Dynamic)");
        const percentageOrder = await this.createIcebergOrder(
            {
                makerAsset,
                takerAsset,
                makingAmount: ethers.parseEther("50"), // 50 WETH total
                takingAmount: ethers.parseEther("200000"), // 200k DAI
                maker,
            },
            {
                totalMakingAmount: ethers.parseEther("50"),
                totalTakingAmount: ethers.parseEther("200000"),
                baseChunkSize: ethers.parseEther("5"), // Base size (not used for percentage)
                strategy: 1, // PERCENTAGE
                maxVisiblePercent: 800, // 8% of remaining amount
                revealInterval: 600, // 10 minutes between reveals
            }
        );

        // 3. Time-Based Strategy - Increasing Urgency
        console.log("\n3️⃣ TIME-BASED STRATEGY (Increasing Urgency)");
        const timeBasedOrder = await this.createIcebergOrder(
            {
                makerAsset,
                takerAsset,
                makingAmount: ethers.parseEther("30"), // 30 WETH total
                takingAmount: ethers.parseEther("120000"), // 120k DAI
                maker,
            },
            {
                totalMakingAmount: ethers.parseEther("30"),
                totalTakingAmount: ethers.parseEther("120000"),
                baseChunkSize: ethers.parseEther("3"), // 3 WETH base
                strategy: 3, // TIME_BASED
                maxVisiblePercent: 1500, // 15% max visible
                revealInterval: 900, // 15 minutes between reveals
            }
        );

        // 4. Adaptive Strategy - Market Responsive
        console.log("\n4️⃣ ADAPTIVE STRATEGY (Market Responsive)");
        const adaptiveOrder = await this.createIcebergOrder(
            {
                makerAsset,
                takerAsset,
                makingAmount: ethers.parseEther("100"), // 100 WETH total
                takingAmount: ethers.parseEther("400000"), // 400k DAI
                maker,
            },
            {
                totalMakingAmount: ethers.parseEther("100"),
                totalTakingAmount: ethers.parseEther("400000"),
                baseChunkSize: ethers.parseEther("5"), // 5 WETH base
                strategy: 2, // ADAPTIVE
                maxVisiblePercent: 500, // 5% max visible (more conservative)
                revealInterval: 1200, // 20 minutes between reveals
            }
        );

        console.log("\n✅ All example orders created successfully!\n");

        return {
            fixedSizeOrder,
            percentageOrder,
            timeBasedOrder,
            adaptiveOrder,
        };
    }

    /**
     * Simulate order execution lifecycle
     */
    async simulateOrderLifecycle(orderData) {
        console.log("\n🎬 Simulating Order Lifecycle...\n");

        const { order, orderHash, signature } = orderData;

        // 1. Monitor initial state
        console.log("📊 Initial State:");
        await this.monitorOrder(orderHash);

        // 2. Wait for reveal interval
        console.log("\n⏰ Waiting for reveal interval...");
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate time passage

        // 3. Check keeper upkeep
        const { upkeepNeeded, performData } = await this.checkKeeperUpkeep();

        if (upkeepNeeded) {
            await this.performKeeperUpkeep(performData);
        }

        // 4. Execute a partial fill
        try {
            const currentChunkInfo =
                await this.icebergExtension.getCurrentChunkInfo(orderHash);
            const fillAmount = currentChunkInfo[0] / 2n; // Fill 50% of current chunk

            if (fillAmount > 0) {
                console.log("\n💰 Executing Partial Fill...");
                await this.executePartialFill(order, signature, fillAmount);

                // Monitor after fill
                console.log("\n📊 After Fill:");
                await this.monitorOrder(orderHash);
            }
        } catch (error) {
            console.log(
                "ℹ️ Could not execute fill (expected for demo):",
                error.message
            );
        }

        // 5. Manually reveal next chunk
        console.log("\n🔄 Manually revealing next chunk...");
        try {
            await this.revealNextChunk(orderHash);
        } catch (error) {
            console.log("ℹ️ Could not reveal next chunk:", error.message);
        }

        console.log("\n✅ Lifecycle simulation complete!\n");
    }

    // Helper methods

    _getStrategyName(strategy) {
        const strategies = [
            "FIXED_SIZE",
            "PERCENTAGE",
            "ADAPTIVE",
            "TIME_BASED",
        ];
        return strategies[strategy] || "UNKNOWN";
    }

    /**
     * Display comprehensive order analytics
     */
    async displayOrderAnalytics(orderHash) {
        console.log(
            "\n📈 Order Analytics for:",
            orderHash.slice(0, 10) + "...\n"
        );

        try {
            // Get iceberg config
            const config = await this.icebergExtension.icebergConfigs(
                orderHash
            );

            // Get current chunk info
            const [chunkSize, filledAmount, remainingAmount, isReady] =
                await this.icebergExtension.getCurrentChunkInfo(orderHash);

            // Get completion status
            const [completed, fillPercentage] =
                await this.icebergExtension.isIcebergCompleted(orderHash);

            console.log("🎯 Configuration:");
            console.log(
                "  Total Amount:",
                ethers.formatEther(config.totalMakingAmount),
                "WETH"
            );
            console.log(
                "  Base Chunk Size:",
                ethers.formatEther(config.baseChunkSize),
                "WETH"
            );
            console.log(
                "  Strategy:",
                this._getStrategyName(Number(config.strategy))
            );
            console.log(
                "  Max Visible:",
                (Number(config.maxVisiblePercent) / 100).toFixed(1) + "%"
            );
            console.log(
                "  Reveal Interval:",
                Number(config.revealInterval),
                "seconds"
            );

            console.log("\n📊 Current Status:");
            console.log(
                "  Current Chunk:",
                ethers.formatEther(chunkSize),
                "WETH"
            );
            console.log(
                "  Filled Amount:",
                ethers.formatEther(filledAmount),
                "WETH"
            );
            console.log(
                "  Remaining Amount:",
                ethers.formatEther(remainingAmount),
                "WETH"
            );
            console.log(
                "  Fill Progress:",
                (Number(fillPercentage) / 100).toFixed(2) + "%"
            );
            console.log("  Is Active:", config.isActive);
            console.log("  Is Ready:", isReady);
            console.log("  Is Completed:", completed);

            // Calculate estimated completion
            if (!completed && chunkSize > 0) {
                const chunksRemaining = Math.ceil(
                    Number(remainingAmount) / Number(chunkSize)
                );
                const estimatedTime =
                    chunksRemaining * Number(config.revealInterval);
                console.log("\n⏱️ Estimates:");
                console.log("  Chunks Remaining:", chunksRemaining);
                console.log(
                    "  Est. Completion Time:",
                    Math.floor(estimatedTime / 60),
                    "minutes"
                );
            }
        } catch (error) {
            console.error("❌ Failed to get analytics:", error.message);
        }

        console.log("\n" + "=".repeat(50) + "\n");
    }
}

// Example usage function
async function runIcebergOrderExample() {
    console.log("🧊 Starting Iceberg Order Example\n");

    // This would be called from a deployment script or test
    // with actual deployed contract instances

    /*
    const [deployer, trader] = await ethers.getSigners();
    
    // Deploy or connect to contracts
    const limitOrderProtocol = await ethers.getContractAt('LimitOrderProtocol', PROTOCOL_ADDRESS);
    const icebergExtension = await ethers.getContractAt('IcebergOrderV1', ICEBERG_ADDRESS);
    const keeper = await ethers.getContractAt('MockIcebergKeeper', KEEPER_ADDRESS);
    
    // Initialize manager
    const manager = new IcebergOrderManager(limitOrderProtocol, icebergExtension, keeper, trader);
    await manager.initialize();
    
    // Create example orders
    const examples = await manager.createExampleOrders(WETH_ADDRESS, DAI_ADDRESS, trader.address);
    
    // Simulate lifecycle for one order
    await manager.simulateOrderLifecycle(examples.fixedSizeOrder);
    
    // Display analytics for all orders
    for (const [name, orderData] of Object.entries(examples)) {
        console.log(`\n📊 ${name.toUpperCase()} ORDER ANALYTICS:`);
        await manager.displayOrderAnalytics(orderData.orderHash);
    }
    */

    console.log("✅ Iceberg Order Example completed successfully!");
}

module.exports = {
    IcebergOrderManager,
    runIcebergOrderExample,
};

// Run example if called directly
if (require.main === module) {
    runIcebergOrderExample().catch(console.error);
}
