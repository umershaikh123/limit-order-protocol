/**
 * Take Profit Order Lifecycle Demo
 * 
 * This script demonstrates the complete lifecycle of a take profit order:
 * 1. Deploy contracts and setup environment
 * 2. Create and sign a take profit order 
 * 3. Configure take profit parameters
 * 4. Simulate price movement to trigger the order
 * 5. Execute/fill the order on-chain
 * 
 * Scenario: Trader has 5000 DAI and wants to buy WETH when price drops to $3500
 * This is a "take profit" opportunity - buying the dip at a good price.
 */

const { ethers } = require("hardhat");
const { ether } = require("../test/helpers/utils");
const {
    signOrder,
    buildOrder,
    buildTakerTraits,
} = require("../test/helpers/orderUtils");
const { deploySwapTokens } = require("../test/helpers/fixtures");

// Helper function to build extension data for AmountGetter
function buildTakeProfitExtensionData(stopLossAddress, extraData = "0x") {
    return ethers.solidityPacked(
        ["address", "bytes"],
        [stopLossAddress, extraData]
    );
}

async function main() {
    console.log("🚀 Take Profit Order Lifecycle Demo");
    console.log("=" .repeat(60));
    console.log("📈 Scenario: Buy WETH at $3500 when price drops (buying the dip)");

    // Get signers - same as frontend would use
    const [deployer, trader, taker] = await ethers.getSigners();
    console.log(`\n👥 Participants:`);
    console.log(`   Trader (Maker): ${trader.address}`);
    console.log(`   Taker (Executor): ${taker.address}`);

    // STEP 1: Deploy and setup contracts
    console.log(`\n🏗️  STEP 1: Contract Deployment & Setup`);
    console.log("-".repeat(50));
    
    const tokens = await deploySwapTokens();
    const { dai, weth, usdc, swap, chainId } = tokens;

    // Deploy Stop Loss Extension (used for take profit too)
    const StopLossMarketOrderV2 = await ethers.getContractFactory("StopLossMarketOrderV2");
    const takeProfitExtension = await StopLossMarketOrderV2.deploy(await swap.getAddress());
    await takeProfitExtension.waitForDeployment();

    // Deploy oracles
    const MutableAggregatorMock = await ethers.getContractFactory("MutableAggregatorMock");
    const daiOracle = await MutableAggregatorMock.deploy(ether("0.00025")); // 1 DAI = 0.00025 ETH ($4000 WETH price)
    await daiOracle.waitForDeployment();
    const wethOracle = await MutableAggregatorMock.deploy(ether("1")); // 1 WETH = 1 ETH  
    await wethOracle.waitForDeployment();

    console.log(`✅ Contracts deployed:`);
    console.log(`   LimitOrderProtocol: ${await swap.getAddress()}`);
    console.log(`   WETH: ${await weth.getAddress()}`);
    console.log(`   DAI: ${await dai.getAddress()}`);
    console.log(`   TakeProfit Extension: ${await takeProfitExtension.getAddress()}`);
    console.log(`   WETH Oracle: ${await wethOracle.getAddress()}`);
    console.log(`   DAI Oracle: ${await daiOracle.getAddress()}`);

    // Configure extension
    await takeProfitExtension.setOracleHeartbeat(await daiOracle.getAddress(), 4 * 3600);
    await takeProfitExtension.setOracleHeartbeat(await wethOracle.getAddress(), 4 * 3600);
    console.log(`✅ Extension configured with oracle heartbeats`);

    // Fund accounts and set approvals - Trader starts with DAI, wants to buy WETH
    await dai.mint(trader.address, ether("5000")); // Trader has 5000 DAI
    await weth.connect(taker).deposit({ value: ether("10") }); // Taker has WETH to sell
    await dai.connect(trader).approve(await swap.getAddress(), ether("5000"));
    await weth.connect(taker).approve(await swap.getAddress(), ether("10"));
    console.log(`✅ Accounts funded and approvals set`);

    // STEP 2: Create and sign order (like frontend)
    console.log(`\n📝 STEP 2: Create and Sign Take Profit Order`);
    console.log("-".repeat(50));

    const orderParams = {
        maker: trader.address,
        makerAsset: await dai.getAddress(), // Trader is selling DAI
        takerAsset: await weth.getAddress(), // Trader wants to buy WETH
        makingAmount: ether("3500"), // 3500 DAI (willing to spend)
        takingAmount: ether("1"), // 1 WETH (wants to buy)
        receiver: trader.address,
    };

    console.log(`📋 Take Profit Order Parameters:`);
    console.log(`   Selling: ${ethers.formatEther(orderParams.makingAmount)} DAI`);
    console.log(`   To Buy: ${ethers.formatEther(orderParams.takingAmount)} WETH`);
    console.log(`   Target Price: $3500 per WETH (buying the dip!)`);
    console.log(`   Current Market Price: ~$4000 per WETH`);

    // Build order with take profit extension
    const takeProfitOrder = buildOrder(
        orderParams,
        {
            makingAmountData: buildTakeProfitExtensionData(await takeProfitExtension.getAddress()),
            takingAmountData: buildTakeProfitExtensionData(await takeProfitExtension.getAddress()),
        }
    );

    const orderHash = await swap.hashOrder(takeProfitOrder);
    console.log(`✅ Take profit order created with hash: ${orderHash.slice(0, 10)}...`);

    // Sign the order (like frontend with MetaMask)
    const signature = await signOrder(takeProfitOrder, chainId, await swap.getAddress(), trader);
    console.log(`✅ Order signed by trader`);

    // STEP 3: Configure take profit parameters
    console.log(`\n⚙️  STEP 3: Configure Take Profit Parameters`);
    console.log("-".repeat(50));

    // For take profit: we want to buy WETH when its price drops
    // The current price formula gives us: (DAI_price_in_ETH * 10^18) / WETH_price_in_ETH
    // With DAI = 0.000285714 ETH and WETH = 1 ETH, we get 0.000285714 * 10^18
    // To trigger when this value rises (meaning WETH gets cheaper), we set a lower threshold
    const takeProfitConfig = {
        makerAssetOracle: await daiOracle.getAddress(), // DAI oracle (what we're selling)
        takerAssetOracle: await wethOracle.getAddress(), // WETH oracle (what we're buying)
        stopPrice: ether("0.00026"), // Trigger when current ratio > 0.00026 (WETH cheaper than $3846)
        maxSlippage: 100, // 1% slippage tolerance
        maxPriceDeviation: 500, // 5% max price change per block
        isStopLoss: false, // Take profit: trigger when price rises ABOVE threshold
        keeper: ethers.ZeroAddress, // Any keeper can execute
        orderMaker: trader.address,
        configuredAt: 0, // Will be set automatically
        makerTokenDecimals: 18, // DAI decimals
        takerTokenDecimals: 18, // WETH decimals
    };

    console.log(`📋 Take Profit Configuration:`);
    console.log(`   Trigger Threshold: 0.00026 (oracle ratio format)`);
    console.log(`   Current Price: ~$4000 USD (DAI worth 0.00025 ETH)`);
    console.log(`   Target Price: ~$3846 USD (DAI worth 0.00026 ETH)`);
    console.log(`   Max Slippage: 1%`);
    console.log(`   Is Stop Loss: ${takeProfitConfig.isStopLoss} (take profit logic)`);
    console.log(`   Strategy: BUY when DAI/ETH ratio goes ABOVE 0.00026`);

    await takeProfitExtension.connect(trader).configureStopLoss(orderHash, trader.address, takeProfitConfig);
    console.log(`✅ Take profit configured successfully`);

    // STEP 4: Simulate price movement and check trigger
    console.log(`\n📉 STEP 4: Simulate Market Conditions`);
    console.log("-".repeat(50));

    // Check initial trigger status
    let [isTriggered, currentPrice] = await takeProfitExtension.isStopLossTriggered(orderHash);
    console.log(`🔍 Initial Status: ${isTriggered ? "🟢 TRIGGERED (Ready to Buy!)" : "🔴 NOT TRIGGERED (Price too high)"}`);
    console.log(`   Current Price: ${ethers.formatEther(currentPrice)} (normalized)`);
    console.log(`   Waiting for WETH price to drop from $4000 to $3500...`);

    // Wait for initial price history to build
    console.log(`⏰ Building initial TWAP price history...`);
    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine");

    // Simulate price drop to trigger take profit (buying opportunity)
    console.log(`\n📉 Simulating WETH price drop from $4000 to $3500...`);
    console.log(`💡 This creates a buying opportunity - perfect for take profit!`);
    console.log(`   Changing DAI/ETH oracle from 0.00025 to 0.000285714`);
    console.log(`   This means: 1 WETH = 1/0.000285714 = 3500 DAI ($3500)`);
    await daiOracle.updateAnswer(ether("0.000285714")); // 1 DAI = 0.000285714 ETH -> WETH/DAI = 3500
    
    // Wait for TWAP adjustment
    console.log(`⏰ Waiting for TWAP price adjustment...`);
    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine");

    // Check trigger status after price drop
    [isTriggered, currentPrice] = await takeProfitExtension.isStopLossTriggered(orderHash);
    console.log(`🔍 After Price Drop: ${isTriggered ? "🟢 TRIGGERED (Time to Buy!)" : "🔴 NOT TRIGGERED"}`);
    console.log(`   Current Price: ${ethers.formatEther(currentPrice)} (DAI/ETH ratio)`);
    console.log(`   Target Price: 0.00026 (trigger when current > target)`);

    if (isTriggered) {
        console.log(`🎯 Perfect! WETH dropped enough - time to buy the dip!`);
    } else {
        console.log(`⚠️  Take profit not triggered yet. Current ratio not high enough.`);
        console.log(`💡 Let's check actual values: current=${Number(ethers.formatEther(currentPrice)).toFixed(9)}, target=0.00026`);
    }

    // STEP 5: Execute/Fill the order (like frontend execution)
    console.log(`\n🎯 STEP 5: Execute Take Profit Order On-Chain`);
    console.log("-".repeat(50));

    console.log(`📋 Order Execution Details:`);
    console.log(`   Order Hash: ${orderHash}`);
    console.log(`   Executor (Taker): ${taker.address}`);
    console.log(`   Trade: ${ethers.formatEther(orderParams.makingAmount)} DAI → 1 WETH`);
    console.log(`   Execution Price: $3500 per WETH (great deal!)`);

    // Get balances before execution
    const balancesBefore = {
        traderWETH: await weth.balanceOf(trader.address),
        traderDAI: await dai.balanceOf(trader.address),
        takerWETH: await weth.balanceOf(taker.address),
        takerDAI: await dai.balanceOf(taker.address),
    };

    console.log(`💰 Balances Before Execution:`);
    console.log(`   Trader WETH: ${ethers.formatEther(balancesBefore.traderWETH)}`);
    console.log(`   Trader DAI: ${ethers.formatEther(balancesBefore.traderDAI)}`);
    console.log(`   Taker WETH: ${ethers.formatEther(balancesBefore.takerWETH)}`);
    console.log(`   Taker DAI: ${ethers.formatEther(balancesBefore.takerDAI)}`);

    // Convert signature to r, vs format for fillOrderArgs
    const { r, yParityAndS: vs } = ethers.Signature.from(signature);

    // Build taker traits with extension from the order
    const takerTraits = buildTakerTraits({
        extension: takeProfitOrder.extension,
    });

    // Debug: Check what the extension is calculating
    try {
        const takingAmountFromExtension = await takeProfitExtension.getTakingAmount(
            takeProfitOrder,
            "0x",
            orderHash,
            taker.address,
            orderParams.makingAmount,
            orderParams.makingAmount,
            "0x"
        );
        console.log(`🔍 Extension calculated taking amount: ${ethers.formatEther(takingAmountFromExtension)} WETH`);
    } catch (error) {
        console.log(`⚠️  Extension calculation failed: ${error.message}`);
    }

    console.log(`🔄 Executing take profit order via fillOrderArgs...`);
    
    try {
        const fillTx = await swap.connect(taker).fillOrderArgs(
            takeProfitOrder,
            r,
            vs,
            orderParams.makingAmount, // Fill full amount (3500 DAI)
            takerTraits.traits,
            takerTraits.args
        );

        const receipt = await fillTx.wait();
        console.log(`✅ Take profit order executed successfully!`);
        console.log(`   Transaction Hash: ${fillTx.hash}`);
        console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);

        // Get balances after execution
        const balancesAfter = {
            traderWETH: await weth.balanceOf(trader.address),
            traderDAI: await dai.balanceOf(trader.address),
            takerWETH: await weth.balanceOf(taker.address),
            takerDAI: await dai.balanceOf(taker.address),
        };

        console.log(`\n💰 Balances After Execution:`);
        console.log(`   Trader WETH: ${ethers.formatEther(balancesAfter.traderWETH)} (+${ethers.formatEther(balancesAfter.traderWETH - balancesBefore.traderWETH)})`);
        console.log(`   Trader DAI: ${ethers.formatEther(balancesAfter.traderDAI)} (${ethers.formatEther(balancesAfter.traderDAI - balancesBefore.traderDAI)})`);
        console.log(`   Taker WETH: ${ethers.formatEther(balancesAfter.takerWETH)} (${ethers.formatEther(balancesAfter.takerWETH - balancesBefore.takerWETH)})`);
        console.log(`   Taker DAI: ${ethers.formatEther(balancesAfter.takerDAI)} (+${ethers.formatEther(balancesAfter.takerDAI - balancesBefore.takerDAI)})`);

        const wethGained = balancesAfter.traderWETH - balancesBefore.traderWETH;
        const daiSpent = balancesBefore.traderDAI - balancesAfter.traderDAI;
        const effectivePrice = Number(ethers.formatEther(daiSpent)) / Number(ethers.formatEther(wethGained));

        console.log(`\n📊 Trade Summary:`);
        console.log(`   WETH Purchased: ${ethers.formatEther(wethGained)}`);
        console.log(`   DAI Spent: ${ethers.formatEther(daiSpent)}`);
        console.log(`   Effective Price: $${effectivePrice.toFixed(2)} per WETH`);
        console.log(`   Market Savings: $${(4000 - effectivePrice).toFixed(2)} per WETH (${(((4000 - effectivePrice) / 4000) * 100).toFixed(1)}% discount!)`);

        console.log(`\n🎉 TAKE PROFIT ORDER LIFECYCLE COMPLETED SUCCESSFULLY!`);
        console.log(`✅ Successfully bought WETH at a discount during the dip!`);

    } catch (error) {
        console.error(`❌ Take profit order execution failed:`, error.message);
        
        if (error.message.includes("PredicateFalse")) {
            console.log(`💡 PredicateFalse error: Take profit condition may not be met`);
            console.log(`   This could be due to TWAP lag or oracle configuration`);
        }
        
        throw error;
    }

    // STEP 6: Summary
    console.log(`\n📋 TAKE PROFIT LIFECYCLE SUMMARY`);
    console.log("=".repeat(60));
    console.log(`✅ Contract Deployment: Success`);
    console.log(`✅ Take Profit Order Creation: Success`);
    console.log(`✅ Order Signing: Success`);
    console.log(`✅ Take Profit Configuration: Success (Buy at $3500)`);
    console.log(`✅ Price Simulation: Success (Market dropped to $3500)`);
    console.log(`✅ Order Execution: Success (Bought the dip!)`);
    console.log(`\n🎯 This demonstrates a complete take profit lifecycle!`);
    console.log(`💡 Take Profit Strategy: Buy WETH when price drops to attractive levels`);
    console.log(`📈 Perfect for dollar-cost averaging and buying market dips`);

    return {
        orderHash,
        contracts: {
            limitOrderProtocol: await swap.getAddress(),
            weth: await weth.getAddress(),
            dai: await dai.getAddress(),
            takeProfit: await takeProfitExtension.getAddress(),
            wethOracle: await wethOracle.getAddress(),
            daiOracle: await daiOracle.getAddress(),
        },
        success: true
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(`\n❌ Take Profit Demo failed with error:`);
        console.error(error);
        process.exit(1);
    });