# Stop Loss Market Order Extension

This extension enables automated stop loss and take profit market orders for the 1inch Limit Order Protocol using Chainlink price feeds and the 1inch Aggregation Router.

## Overview

The Stop Loss Market Order system consists of three main components:

1. **StopLossMarketOrder.sol** - Extension contract that monitors prices and executes market orders
2. **StopLossKeeper.sol** - Automated keeper for monitoring and triggering orders
3. **Integration with 1inch Aggregation Router** - For best execution at market prices

## Key Features

- **Automated Execution**: Orders execute automatically when price conditions are met
- **Chainlink Price Feeds**: Reliable, decentralized price data
- **Market Orders**: Execute at current market prices via 1inch Aggregation Router
- **Stop Loss & Take Profit**: Support for both order types
- **Keeper Network Compatible**: Works with Chainlink Automation or custom keepers
- **Slippage Protection**: Configurable maximum slippage tolerance

## How It Works

### 1. Order Creation

Create a limit order with stop loss extension:

```javascript
const order = {
    makerAsset: WETH_ADDRESS,
    takerAsset: DAI_ADDRESS,
    makingAmount: ethers.parseEther("1"),
    takingAmount: ethers.parseEther("3600"),
    maker: makerAddress,
    // Set stop loss extension as pre/post interaction
    extension: {
        preInteraction: STOP_LOSS_EXTENSION_ADDRESS,
        postInteraction: STOP_LOSS_EXTENSION_ADDRESS
    }
};
```

### 2. Configure Stop Loss

Configure the stop loss parameters:

```javascript
await stopLossExtension.configureStopLoss(orderHash, {
    makerAssetOracle: WETH_ORACLE,      // Chainlink price feed
    takerAssetOracle: DAI_ORACLE,       // Chainlink price feed
    stopPrice: ethers.parseEther("3800"), // Stop at 3800 DAI/ETH
    maxSlippage: 100,                   // 1% max slippage
    isStopLoss: true,                   // true = stop loss, false = take profit
    keeper: KEEPER_ADDRESS              // Authorized keeper (0x0 for any)
});
```

### 3. Automated Monitoring

The keeper monitors configured orders:

```javascript
// Add order to keeper monitoring
await stopLossKeeper.addOrder(order, signature, swapData);

// Keeper checks for triggered orders (Chainlink Automation compatible)
const [upkeepNeeded, performData] = await stopLossKeeper.checkUpkeep('0x');

// Execute triggered orders
if (upkeepNeeded) {
    await stopLossKeeper.performUpkeep(performData);
}
```

### 4. Market Execution

When triggered, the extension:
1. Validates the stop loss condition using Chainlink oracles
2. Executes a market swap via 1inch Aggregation Router
3. Ensures slippage protection
4. Transfers tokens to the taker

## Price Calculation

The system calculates relative prices between assets:

```
Price = (MakerAssetPrice / TakerAssetPrice) * 10^18
```

For example:
- ETH/USD: $4000
- DAI/USD: $1
- ETH/DAI Price = 4000 * 10^18

## Deployment

1. Deploy StopLossMarketOrder with aggregation router and protocol addresses
2. Deploy StopLossKeeper with protocol and extension addresses
3. Fund keeper contract with ETH for rewards
4. Configure Chainlink Automation or run custom keeper bot

## Example Use Cases

### Stop Loss Order
Sell ETH if price drops below 3800 DAI:
```javascript
stopPrice: ethers.parseEther("3800")
isStopLoss: true
```

### Take Profit Order
Sell ETH if price rises above 4500 DAI:
```javascript
stopPrice: ethers.parseEther("4500")
isStopLoss: false
```

## Security Considerations

- Only authorized keepers can execute orders (if configured)
- Slippage protection prevents excessive losses
- Oracle staleness checks ensure fresh price data
- Pre-interaction validation prevents unauthorized fills

## Gas Optimization

- Efficient storage packing in StopLossConfig struct
- Minimal external calls during price checks
- Batch execution support for multiple orders

## Integration with Existing Orders

The extension is fully compatible with existing limit order features:
- Partial fills
- Predicates
- Other extensions
- Standard EIP-712 signatures

## Testing

Run the test suite:
```bash
npx hardhat test test/StopLossMarketOrder.js
```

The tests cover:
- Stop loss configuration
- Price trigger detection
- Keeper operations
- Market order execution
- Edge cases and error handling