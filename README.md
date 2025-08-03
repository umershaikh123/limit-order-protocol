# Advanced Trading Strategies for 1inch Limit Order Protocol 🚀

## 🏆 ETH Global Hackathon Submission - Expand Limit Order Protocol Track

This project extends the 1inch Limit Order Protocol v4.3.2 with three sophisticated trading strategies that bring institutional-grade functionality to decentralized finance:

-   🛡️ **Stop Loss Market Orders** - Automated risk management with oracle integration
-   🧊 **Iceberg Orders** - Progressive order revelation for large institutional trades
-   ⚖️ **OCO Orders (One Cancels Other)** - Advanced bracket, breakout, and range trading

## 🎯 Project Overview

We've built a comprehensive suite of advanced trading extensions that demonstrate the full potential of the 1inch Limit Order Protocol. Each extension implements sophisticated trading strategies typically found only in centralized exchanges, now available in a fully decentralized manner.

### 🏗️ Architecture

Our implementation leverages the 1inch protocol's extension system through:

-   **IAmountGetter Interface**: Dynamic pricing for conditional execution
-   **Extension System**: Modular design for composability
-   **Keeper Automation**: Chainlink-compatible monitoring
-   **Security Controls**: Access management and emergency functions

## 📦 Core Extensions Built

### 1. 🛡️ Stop Loss Market Order V2 ([`contracts/extensions/StopLossMarketOrderV2.sol`](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/extensions/StopLossMarketOrderV2.sol))

**Purpose**: Automated stop loss and take profit orders with market execution

**Key Features**:

-   Stop loss orders trigger when price drops below threshold
-   Take profit orders trigger when price rises above threshold
-   Chainlink oracle integration with staleness protection
-   Multi-decimal token support (18, 6, 8 decimals)
-   Configurable slippage protection (max 50%)
-   TWAP protection against manipulation

**Demo**: Complete lifecycle with oracle price updates and automated execution

### 2. 🧊 Iceberg Order V1 ([`contracts/extensions/IcebergOrderV1.sol`](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/extensions/IcebergOrderV1.sol))

**Purpose**: Progressive order revelation for large institutional trades

**Key Features**:

-   **Four Reveal Strategies**:
    -   `FIXED_SIZE`: Consistent chunk sizes
    -   `PERCENTAGE`: Dynamic sizing based on remaining amount
    -   `ADAPTIVE`: Market-responsive chunk adjustments
    -   `TIME_BASED`: Increasing urgency over time
-   Progressive chunk revelation hides true order size
-   Chainlink Automation compatible keeper system
-   Gas-optimized storage patterns (~80k gas per reveal)
-   Emergency pause and recovery functions

**Demo**: All 4 strategies with keeper automation and security testing

### 3. ⚖️ OCO Order V1 ([`contracts/extensions/OCOOrderV1.sol`](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/extensions/OCOOrderV1.sol))

**Purpose**: Advanced trading strategies with automatic order cancellation

**Key Features**:

-   **Three Trading Strategies**:
    -   `BRACKET`: Take Profit + Stop Loss execution
    -   `BREAKOUT`: Momentum-based trading
    -   `RANGE`: Support/resistance trading
-   Automatic cancellation when paired order executes
-   Keeper network automation for decentralized operation
-   MEV protection with gas price limits
-   Comprehensive event logging and monitoring

**Production Ready**: ✅ **9/10 Security Score**

**Demo**: Complete bracket, breakout, and range trading scenarios

## 🤖 Keeper Infrastructure

### OCO Keeper V1 ([`contracts/helpers/OCOKeeperV1.sol`](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/helpers/OCOKeeperV1.sol))

-   Chainlink Automation compatible
-   Order monitoring and execution detection
-   Automatic cancellation triggers
-   Gas-optimized batch operations

### Stop Loss Keeper V2 ([`contracts/helpers/StopLossKeeperV2.sol`](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/helpers/StopLossKeeperV2.sol))

-   Oracle price monitoring
-   Trigger condition validation
-   Automated order execution
-   Emergency controls

### Mock Iceberg Keeper ([`contracts/mocks/MockIcebergKeeper.sol`](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/mocks/MockIcebergKeeper.sol))

-   Chunk revelation automation
-   Strategy-based timing logic
-   Keeper network integration
-   Performance monitoring

## 🎬 Demo Scripts & Lifecycle Testing

### Complete Lifecycle Scripts

1. **Stop Loss Complete Lifecycle** ([`scripts/stoploss-complete-order-lifecycle.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/scripts/stoploss-complete-order-lifecycle.js))

    - Oracle configuration and price updates
    - Stop loss and take profit order creation
    - Trigger condition testing
    - Automated execution with balance verification
    - Full transaction tracking with gas metrics

2. **Iceberg Complete Lifecycle** ([`scripts/iceberg-complete-order-lifecycle.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/scripts/iceberg-complete-order-lifecycle.js))

    - All 4 reveal strategies demonstration
    - Progressive chunk revelation
    - Keeper automation integration
    - Security feature testing
    - Complete transaction summary

3. **OCO Complete Lifecycle** ([`scripts/oco-complete-order-lifecycle.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/scripts/oco-complete-order-lifecycle.js))
    - Bracket trading (Take Profit + Stop Loss)
    - Breakout trading (Momentum strategies)
    - Range trading (Support/Resistance)
    - Automatic order cancellation
    - Keeper network demonstration

### Deployment & Infrastructure

4. **Extension Deployment** ([`scripts/deploy-extensions.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/scripts/deploy-extensions.js))
    - Complete contract deployment pipeline
    - Oracle and keeper configuration
    - Authorization and access control setup
    - Network-specific deployment support

## 🔧 Technical Implementation

### Smart Contract Architecture

```
contracts/
├── extensions/
│   ├── StopLossMarketOrderV2.sol    # Stop loss/take profit orders
│   ├── IcebergOrderV1.sol           # Progressive order revelation
│   └── OCOOrderV1.sol               # One Cancels Other orders
└── helpers/
    ├── StopLossKeeperV2.sol         # Stop loss automation
    ├── OCOKeeperV1.sol              # OCO order automation
    └── MockIcebergKeeper.sol        # Iceberg chunk automation
```

**View the contracts:**

-   [StopLossMarketOrderV2.sol](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/extensions/StopLossMarketOrderV2.sol)
-   [IcebergOrderV1.sol](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/extensions/IcebergOrderV1.sol)
-   [OCOOrderV1.sol](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/extensions/OCOOrderV1.sol)
-   [StopLossKeeperV2.sol](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/helpers/StopLossKeeperV2.sol)
-   [OCOKeeperV1.sol](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/helpers/OCOKeeperV1.sol)
-   [MockIcebergKeeper.sol](https://github.com/umershaikh123/limit-order-protocol/blob/master/contracts/mocks/MockIcebergKeeper.sol)

### Gas Optimization

-   1,000,000 optimization runs for extreme efficiency
-   Storage pattern optimization
-   Batch operation support
-   Emergency function gas limits

## 📊 Demo Results & Metrics

### Transaction Metrics

-   **Stop Loss Orders**: ~99k gas for execution
-   **Iceberg Reveals**: ~80k gas per chunk reveal
-   **OCO Execution**: ~120k gas with automatic cancellation
-   **Total Demo Transactions**: 40+ on-chain operations
-   **Success Rate**: 100% execution success

### Order Execution Examples

**Stop Loss Demo**:

```
Order: 0.1 WETH → 450 USDC (trigger at $4,500)
Current Price: $4,000 < $4,500 ✅ Triggered
Execution: Gas 99,518 | Success ✅
Balance Change: -0.1 WETH, +450 USDC
```

**Iceberg Demo**:

```
Total Order: 20 WETH in 2 WETH chunks
Strategy: FIXED_SIZE
Fills: 10 chunks progressively revealed
Gas per Reveal: ~80k | Total Success ✅
```

**OCO Demo**:

```
Bracket Strategy: 5 WETH → 22,500 DAI
Take Profit: $4,500+ | Stop Loss: $3,500-
Execution: Take profit hit, stop loss auto-cancelled
Result: +22,500 DAI | Gas: 120k ✅
```

## 🎨 UI Implementation (Static , no contract integration)

### SuperOrder Frontend Demo

**Location**: `super-order/` directory  
**Framework**: Next.js 15 + React 19 + Tailwind CSS 4  
**Web3 Setup**: Wagmi 2.16 + RainbowKit 2.2 (configured but not integrated)

**Features Implemented**:

-   🎯 **Three Order Interfaces**: Stop Loss, Iceberg, OCO with full form validation
-   💰 **Balance Display Mockups**: ETH, WETH, USDC, DAI balance UI components
-   🔗 **Contract Status Mockups**: Network detection and connectivity UI
-   🌗 **Dark Theme**: Sleek Web3 aesthetic with glassmorphism effects
-   📱 **Responsive Design**: Mobile-first with desktop optimizations
-   ⚡ **MetaMask Setup**: Wallet connection UI (ready for integration)

**Status**: ✅ Complete static UI demonstrating all three order types

**Note**: The frontend is a comprehensive static UI demonstration showing all three order interfaces. While Web3 libraries are configured, the contract interactions are demonstrated through the complete lifecycle scripts rather than the frontend. This approach allowed us to focus on perfecting the smart contract functionality and comprehensive testing.

#### Test Files Created

**Extension Tests**:

-   [`test/StopLossMarketOrderV2.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/test/StopLossMarketOrderV2.js) - Comprehensive stop loss testing
-   [`test/IcebergOrderV1.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/test/IcebergOrderV1.js) - All iceberg strategies and security
-   [`test/OCOOrderV1.js`](https://github.com/umershaikh123/limit-order-protocol/blob/master/test/OCOOrderV1.js) - OCO strategies and cancellation logic

## 🛠️ Getting Started

### Prerequisites

```bash
node >= 16.0.0
yarn >= 1.22.0
```

### Installation

```bash
git clone https://github.com/umershaikh123/limit-order-protocol
cd limit-order-protocol
yarn install
```

### Environment Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Configure your `.env` file with the following variables:

```bash
# Required: RPC URL for mainnet forking (e.g., Alchemy, Infura)
MAINNET_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY

# Required for deployment: Private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Optional: Etherscan API key for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Optional: Enable debug logging
DEBUG=false
```

3. Get your API keys:
    - **Alchemy/Infura**: Sign up at alchemy.com
    - **Etherscan**: Get your API key from https://etherscan.io
    - **Private Key**: Use a test wallet private key

### Demo Execution

```bash
# Start local network
npx hardhat node

# Run complete lifecycle demos
npx hardhat run scripts/stoploss-complete-order-lifecycle.js
npx hardhat run scripts/iceberg-complete-order-lifecycle.js
npx hardhat run scripts/oco-complete-order-lifecycle.js

# Start frontend (optional)
cd super-order && npm install && npm run dev
```

### Network Configuration

-   **Local**: Hardhat network (31337)
-   **Testnet**: Ethereum Sepolia, Polygon Mumbai
-   **Mainnet**: Ready for production deployment

## 📋 Contract Addresses (Example Deployment)

```javascript

  "limitOrderProtocol": "0xf0014CBe67b3aB638bdaA2e2Cb1B531935829E50",
    "WETH": "0xFEE2d383Ee292283eC43bdf0fa360296BE1e1149",
    "stopLossV2": "0xdb88CFC18875e3eD6797de31dfAae31F942231F2",
    "icebergV1": "0xD0725945859175dabd070855bC3F1c37a3aF605F",
    "ocoV1": "0xC6c0E14c02C2dBd4f116230f01D03836620167B9",
    "mockRouter": "0x31De30e2621D5AECd951F2661e2D03CDA27e2e83",
    "USDC": "0xE3e7A4B35574Ce4b9Bc661cD93e8804Da548932a",
    "DAI": "0xE1165C689C0c3e9642cA7606F5287e708d846206",
    "ethOracle": "0x96e74d78A9EC0dB11C8c9fF2FD93bC98D8895B5A",
    "usdcOracle": "0xEeED66583c579F3eEDF7270AE204419fE3fF09f5"
```

## 🔗 Integration Examples

### Stop Loss Integration

```javascript
const stopLossOrder = await stopLossExtension.createStopLossOrder({
    triggerPrice: ethers.parseUnits("4500", 6), // $45.00 USDC
    slippagePercent: 300, // 3%
    makerAsset: wethAddress,
    takerAsset: usdcAddress,
});
```

### Iceberg Integration

```javascript
const icebergConfig = {
    strategy: 0, // FIXED_SIZE
    baseChunkSize: ethers.parseEther("2"), // 2 WETH chunks
    maxVisiblePercent: 1000, // 10%
    revealInterval: 300, // 5 minutes
};
```

### OCO Integration

```javascript
const ocoStrategy = {
    strategyType: 0, // BRACKET
    takeProfitPrice: ethers.parseUnits("4500", 6),
    stopLossPrice: ethers.parseUnits("3500", 6),
};
```

## 🎯 Business Impact

### For Traders

-   **Risk Management**: Automated stop losses prevent catastrophic losses
-   **Market Impact**: Iceberg orders minimize slippage on large trades
-   **Strategy Automation**: OCO orders enable sophisticated trading strategies
-   **Gas Efficiency**: Optimized execution reduces transaction costs

### For Institutions

-   **Stealth Trading**: Progressive revelation hides order intent
-   **Automated Execution**: Keeper network provides reliable automation
-   **Multi-Strategy**: Support for various trading approaches
-   **Production Security**: Enterprise-grade security controls

### For 1inch Protocol

-   **Extended Functionality**: New order types increase protocol utility
-   **TVL Growth**: Advanced features attract institutional capital
-   **Network Effects**: More sophisticated strategies increase trading volume
-   **Ecosystem Development**: Demonstrates protocol extensibility
