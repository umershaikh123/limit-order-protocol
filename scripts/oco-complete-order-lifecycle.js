/**
 * OCO (One Cancels Other) Order Complete Lifecycle Demo
 *
 * This script demonstrates the complete lifecycle of an OCO order from creation to execution.
 * It showcases the core functionality of linked orders that automatically cancel each other.
 *
 * Lifecycle Steps:
 * 1. Contract deployment and setup
 * 2. Create two linked orders (primary and secondary)
 * 3. Configure OCO relationship with strategy
 * 4. EIP-712 signature generation for both orders
 * 5. Execute one order
 * 6. Automatic cancellation of the paired order
 * 7. Keeper-based cancellation processing
 *
 * Usage: npx hardhat run scripts/oco-complete-order-lifecycle.js
 */

const { ethers } = require("hardhat");
const { ether } = require("../test/helpers/utils");
const {
    signOrder,
    buildOrder,
    buildTakerTraits,
} = require("../test/helpers/orderUtils");
const { deploySwapTokens } = require("../test/helpers/fixtures");

// Helper function to build extension data for OCO orders
function buildOCOExtensionData(ocoAddress, extraData = "0x") {
    return ethers.solidityPacked(["address", "bytes"], [ocoAddress, extraData]);
}

// Helper function to create OCO ID from order hashes
function createOCOId(primaryHash, secondaryHash) {
    return ethers.keccak256(
        ethers.solidityPacked(
            ["bytes32", "bytes32"],
            [primaryHash, secondaryHash]
        )
    );
}

// Helper to display order status
async function displayOCOStatus(ocoExtension, ocoId, orderHash1, orderHash2) {
    const config = await ocoExtension.getOCOConfig(ocoId);
    const [isOCO1, ocoId1, isActive1] = await ocoExtension.getOrderOCOStatus(
        orderHash1
    );
    const [isOCO2, ocoId2, isActive2] = await ocoExtension.getOrderOCOStatus(
        orderHash2
    );

    console.log(`\n📊 OCO Status:`);
    console.log(`   OCO ID: ${ocoId.slice(0, 10)}...`);
    console.log(
        `   Strategy: ${["BRACKET", "BREAKOUT", "RANGE"][config.strategy]}`
    );
    console.log(`   Active: ${config.isActive ? "✅" : "❌"}`);
    console.log(`   Primary Order:`);
    console.log(`     - Is OCO: ${isOCO1 ? "✅" : "❌"}`);
    console.log(`     - Active: ${isActive1 ? "✅" : "❌"}`);
    console.log(`     - Executed: ${config.isPrimaryExecuted ? "✅" : "❌"}`);
    console.log(`   Secondary Order:`);
    console.log(`     - Is OCO: ${isOCO2 ? "✅" : "❌"}`);
    console.log(`     - Active: ${isActive2 ? "✅" : "❌"}`);
    console.log(`     - Executed: ${config.isSecondaryExecuted ? "✅" : "❌"}`);
}

// Helper to execute order
async function executeOrder(swap, order, signature, fillAmount, taker, label) {
    console.log(`\n💱 Executing ${label}...`);

    const { r, yParityAndS: vs } = ethers.Signature.from(signature);
    const takerTraits = buildTakerTraits({
        extension: order.extension,
    });

    const tx = await swap
        .connect(taker)
        .fillOrderArgs(
            order,
            r,
            vs,
            fillAmount,
            takerTraits.traits,
            takerTraits.args
        );

    const receipt = await tx.wait();
    console.log(
        `   ✅ Order executed | Gas used: ${receipt.gasUsed.toLocaleString()}`
    );
    return receipt;
}

async function main() {
    console.log("⚖️ OCO Order Complete Lifecycle Demo");
    console.log("=".repeat(60));
    console.log("Demonstrating BRACKET strategy: Take Profit + Stop Loss");

    // Get signers
    const [deployer, trader, taker, keeper] = await ethers.getSigners();
    console.log(`\n👥 Participants:`);
    console.log(`   Trader (Order Maker): ${trader.address}`);
    console.log(`   Taker: ${taker.address}`);
    console.log(`   Keeper: ${keeper.address}`);

    // 1. Deploy contracts
    console.log(`\n🏗️  Step 1: Deploying Contracts`);
    console.log("-".repeat(40));

    const contracts = await deploySwapTokens();
    const { dai, weth, swap, chainId } = contracts;

    console.log(`   LimitOrderProtocol: ${await swap.getAddress()}`);
    console.log(`   WETH: ${await weth.getAddress()}`);
    console.log(`   DAI: ${await dai.getAddress()}`);

    // Deploy OCO Extension
    const OCOOrderV1 = await ethers.getContractFactory("OCOOrderV1");
    const ocoExtension = await OCOOrderV1.deploy(await swap.getAddress());
    await ocoExtension.waitForDeployment();
    console.log(`   OCOOrderV1: ${await ocoExtension.getAddress()}`);

    // Deploy OCO Keeper
    const OCOKeeperV1 = await ethers.getContractFactory("OCOKeeperV1");
    const ocoKeeper = await OCOKeeperV1.deploy(
        await swap.getAddress(),
        await ocoExtension.getAddress()
    );
    await ocoKeeper.waitForDeployment();
    console.log(`   OCOKeeperV1: ${await ocoKeeper.getAddress()}`);

    // 2. Setup tokens and balances
    console.log(`\n💰 Step 2: Setting Up Balances`);
    console.log("-".repeat(40));

    // Trader has WETH position
    await weth.connect(trader).deposit({ value: ether("10") });
    await weth.connect(trader).approve(await swap.getAddress(), ether("10"));

    // Taker has DAI to buy WETH
    await dai.mint(taker.address, ether("50000"));
    await dai.connect(taker).approve(await swap.getAddress(), ether("50000"));

    console.log(`   Trader: 10 WETH`);
    console.log(`   Taker: 50,000 DAI`);

    // Authorize keeper
    await ocoExtension.setKeeperAuthorization(keeper.address, true);
    await ocoKeeper.setKeeperAuthorization(keeper.address, true);
    console.log(`   ✅ Keeper authorized`);

    // 3. Create OCO Orders
    console.log(`\n📝 Step 3: Creating OCO Orders (BRACKET Strategy)`);
    console.log("-".repeat(40));
    console.log(`   Scenario: Trader holds 5 WETH`);
    console.log(`   Take Profit: Sell at $4,500/WETH`);
    console.log(`   Stop Loss: Sell at $3,500/WETH`);

    // Create take profit order (primary)
    const takeProfitOrder = buildOrder(
        {
            makerAsset: await weth.getAddress(),
            takerAsset: await dai.getAddress(),
            makingAmount: ether("5"), // 5 WETH
            takingAmount: ether("22500"), // $22,500 (4500 per WETH)
            maker: trader.address,
        },
        {
            makingAmountData: buildOCOExtensionData(
                await ocoExtension.getAddress()
            ),
            takingAmountData: buildOCOExtensionData(
                await ocoExtension.getAddress()
            ),
            preInteraction: await ocoExtension.getAddress(),
        }
    );

    // Create stop loss order (secondary)
    const stopLossOrder = buildOrder(
        {
            makerAsset: await weth.getAddress(),
            takerAsset: await dai.getAddress(),
            makingAmount: ether("5"), // 5 WETH
            takingAmount: ether("17500"), // $17,500 (3500 per WETH)
            maker: trader.address,
        },
        {
            makingAmountData: buildOCOExtensionData(
                await ocoExtension.getAddress()
            ),
            takingAmountData: buildOCOExtensionData(
                await ocoExtension.getAddress()
            ),
            preInteraction: await ocoExtension.getAddress(),
        }
    );

    const takeProfitHash = await swap.hashOrder(takeProfitOrder);
    const stopLossHash = await swap.hashOrder(stopLossOrder);
    const ocoId = createOCOId(takeProfitHash, stopLossHash);

    console.log(`   Take Profit Order Hash: ${takeProfitHash.slice(0, 10)}...`);
    console.log(`   Stop Loss Order Hash: ${stopLossHash.slice(0, 10)}...`);
    console.log(`   OCO ID: ${ocoId.slice(0, 10)}...`);

    // 4. Configure OCO Relationship
    console.log(`\n⚙️  Step 4: Configuring OCO Relationship`);
    console.log("-".repeat(40));

    const ocoConfig = {
        primaryOrderHash: takeProfitHash,
        secondaryOrderHash: stopLossHash,
        orderMaker: trader.address,
        strategy: 0, // BRACKET strategy
        isPrimaryExecuted: false,
        isSecondaryExecuted: false,
        isActive: true,
        configuredAt: 0,
        authorizedKeeper: ethers.ZeroAddress, // Any authorized keeper
        maxGasPrice: ethers.parseUnits("400", "gwei"),
        expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    };

    await ocoExtension.connect(trader).configureOCO(ocoId, ocoConfig);
    console.log(`   ✅ OCO configured with BRACKET strategy`);

    // 5. Sign Orders
    console.log(`\n✍️  Step 5: Signing Orders with EIP-712`);
    console.log("-".repeat(40));

    const takeProfitSignature = await signOrder(
        takeProfitOrder,
        chainId,
        await swap.getAddress(),
        trader
    );
    const stopLossSignature = await signOrder(
        stopLossOrder,
        chainId,
        await swap.getAddress(),
        trader
    );
    console.log(`   ✅ Both orders signed by trader`);

    // Display initial status
    await displayOCOStatus(ocoExtension, ocoId, takeProfitHash, stopLossHash);

    // 6. Execute Take Profit Order
    console.log(`\n🎯 Step 6: Market Moves Up - Execute Take Profit`);
    console.log("-".repeat(40));
    console.log(`   Market price reaches $4,500/WETH`);
    console.log(`   Taker executes take profit order`);

    // Check balances before
    const traderWETHBefore = await weth.balanceOf(trader.address);
    const traderDAIBefore = await dai.balanceOf(trader.address);
    const takerWETHBefore = await weth.balanceOf(taker.address);
    const takerDAIBefore = await dai.balanceOf(taker.address);

    // Execute take profit order
    await executeOrder(
        swap,
        takeProfitOrder,
        takeProfitSignature,
        ether("5"),
        taker,
        "Take Profit Order"
    );

    // Check balances after
    const traderWETHAfter = await weth.balanceOf(trader.address);
    const traderDAIAfter = await dai.balanceOf(trader.address);
    const takerWETHAfter = await weth.balanceOf(taker.address);
    const takerDAIAfter = await dai.balanceOf(taker.address);

    console.log(`\n💰 Balance Changes:`);
    console.log(`   Trader:`);
    console.log(
        `     - WETH: ${ethers.formatEther(
            traderWETHBefore
        )} → ${ethers.formatEther(traderWETHAfter)} (-5 WETH)`
    );
    console.log(
        `     - DAI: ${ethers.formatEther(
            traderDAIBefore
        )} → ${ethers.formatEther(traderDAIAfter)} (+22,500 DAI)`
    );
    console.log(`   Taker:`);
    console.log(
        `     - WETH: ${ethers.formatEther(
            takerWETHBefore
        )} → ${ethers.formatEther(takerWETHAfter)} (+5 WETH)`
    );
    console.log(
        `     - DAI: ${ethers.formatEther(
            takerDAIBefore
        )} → ${ethers.formatEther(takerDAIAfter)} (-22,500 DAI)`
    );

    // Display status after execution
    await displayOCOStatus(ocoExtension, ocoId, takeProfitHash, stopLossHash);

    // 7. Process Automatic Cancellation
    console.log(`\n🚫 Step 7: Automatic Cancellation of Stop Loss`);
    console.log("-".repeat(40));

    // Check cancellation request
    const cancellationRequest = await ocoExtension.cancellationRequests(
        stopLossHash
    );
    const requestTime = new Date(
        Number(cancellationRequest.requestedAt) * 1000
    );
    console.log(
        `   Cancellation requested at: ${requestTime.toLocaleTimeString()}`
    );
    console.log(`   Requested by: ${cancellationRequest.requester}`);

    // Wait for cancellation delay
    console.log(`\n⏱️  Waiting for cancellation delay (30 seconds)...`);
    await ethers.provider.send("evm_increaseTime", [31]);
    await ethers.provider.send("evm_mine");

    // Process cancellation via keeper
    console.log(`\n🤖 Keeper processing cancellation...`);
    const cancelTx = await ocoExtension
        .connect(keeper)
        .processCancellation(stopLossHash, stopLossOrder.makerTraits);
    const cancelReceipt = await cancelTx.wait();
    console.log(
        `   ✅ Stop loss cancelled | Gas used: ${cancelReceipt.gasUsed.toLocaleString()}`
    );

    // Verify cancellation
    const isOrderCancelled = await swap.bitInvalidatorForOrder(
        trader.address,
        stopLossOrder.salt >> 8n
    );
    const bitPosition = stopLossOrder.salt & 0xffn;
    const isCancelled = (isOrderCancelled & (1n << bitPosition)) !== 0n;
    console.log(`   Order cancellation verified: ${isCancelled ? "✅" : "❌"}`);

    // 8. Final Status
    console.log(`\n🎉 Step 8: Lifecycle Complete!`);
    console.log("-".repeat(40));

    await displayOCOStatus(ocoExtension, ocoId, takeProfitHash, stopLossHash);

    // Attempt to execute cancelled order (should fail)
    console.log(`\n🚫 Verifying Stop Loss Cannot Execute...`);
    try {
        await executeOrder(
            swap,
            stopLossOrder,
            stopLossSignature,
            ether("5"),
            taker,
            "Cancelled Stop Loss"
        );
        console.log(`   ❌ ERROR: Cancelled order should not execute!`);
    } catch (error) {
        console.log(`   ✅ Confirmed: Cancelled order cannot execute`);
    }

    // Summary
    console.log(`\n✅ Lifecycle Summary:`);
    console.log(`   • Created OCO pair: Take Profit + Stop Loss`);
    console.log(`   • Both orders signed and linked via OCO`);
    console.log(`   • Take profit executed when price hit $4,500`);
    console.log(`   • Stop loss automatically cancelled`);
    console.log(`   • Keeper processed cancellation after delay`);
    console.log(`   • Trader successfully took profit at target`);

    console.log(`\n🏁 OCO order lifecycle completed successfully!`);
    console.log(`   This demonstrates how traders can set both`);
    console.log(`   upside and downside targets simultaneously.`);

    // Keeper stats
    console.log(`\n📊 Keeper Performance:`);
    const keeperStats = await ocoKeeper.getKeeperStats(keeper.address);
    console.log(`   Total Executions: ${keeperStats.totalExecutions}`);
    console.log(`   Successful: ${keeperStats.successfulExecutions}`);
    console.log(`   Average Gas: ${keeperStats.averageGasUsed}`);
}

// Execute demo
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(`\n❌ Demo failed:`, error);
        process.exit(1);
    });
