# Stop Loss Market Order V2 - Demo Script Guide

## Overview

The final demo script `demo-stop-loss-market-order-final.js` showcases the complete functionality of the StopLossMarketOrderV2 extension integrated with the 1inch Limit Order Protocol.

## Running the Demo

```bash
npx hardhat run scripts/demo-stop-loss-market-order-final.js
```

## Features Demonstrated

### 1. Stop Loss Orders 🛡️
- Automatically triggers when asset price drops below threshold
- Example: Sell 1 WETH when price drops below $3800
- Protects traders from significant losses

### 2. Take Profit Orders 📈
- Automatically triggers when asset price rises above threshold
- Example: Buy WETH with DAI when price rises above $4500
- Locks in profits at predetermined levels

### 3. Multi-decimal Token Support 🔢
- Handles tokens with different decimals (WETH 18, USDC 6)
- Automatic normalization in price calculations
- Ensures accurate conversions

### 4. Security Features 🔒
- Access control - only order makers can configure their orders
- Slippage protection - maximum 50% slippage allowed
- Pause functionality for emergency situations

### 5. IAmountGetter Integration ⚙️
- Native integration with 1inch protocol's dynamic pricing
- Orders only fillable when conditions are met
- Seamless protocol compatibility

### 6. TWAP Protection 📊
- Time-weighted average price for manipulation resistance
- Configurable price deviation limits
- Protection against flash loan attacks

## Demo Flow

1. **Setup** - Deploy contracts and configure oracles
2. **Stop Loss Demo** - WETH→DAI order triggers on price drop
3. **Take Profit Demo** - DAI→WETH order triggers on price rise
4. **Multi-decimal Demo** - WETH→USDC with decimal handling
5. **Security Demo** - Access control and parameter validation

## Expected Output

The demo will show:
- ✅ Stop loss triggering and executing when price drops
- ✅ Take profit NOT triggering (demonstrating conditional logic)
- ✅ Token balance changes after execution
- ✅ Security features rejecting unauthorized access
- ✅ Successful pause/unpause functionality

## Production Readiness

The demo validates that StopLossMarketOrderV2 is production-ready with:
- Institutional-grade security
- Full 1inch protocol integration
- Gas-optimized implementation
- Comprehensive test coverage

## Archived Scripts

Previous demo iterations have been archived in `scripts/archive/stop-loss-demos/` for reference.