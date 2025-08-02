// Contract addresses and configuration for localhost deployment
export const CONTRACT_ADDRESSES = {
    limitOrderProtocol: "0xf0014CBe67b3aB638bdaA2e2Cb1B531935829E50",
    WETH: "0xFEE2d383Ee292283eC43bdf0fa360296BE1e1149",
    USDC: "0xE3e7A4B35574Ce4b9Bc661cD93e8804Da548932a",
    DAI: "0xE1165C689C0c3e9642cA7606F5287e708d846206",
    stopLossV2: "0xdb88CFC18875e3eD6797de31dfAae31F942231F2",
    icebergV1: "0xD0725945859175dabd070855bC3F1c37a3aF605F",
    ocoV1: "0xC6c0E14c02C2dBd4f116230f01D03836620167B9",
    mockRouter: "0x31De30e2621D5AECd951F2661e2D03CDA27e2e83",
    ethOracle: "0x96e74d78A9EC0dB11C8c9fF2FD93bC98D8895B5A",
    usdcOracle: "0xEeED66583c579F3eEDF7270AE204419fE3fF09f5",
} as const;

// Token configurations
export const TOKENS = {
    WETH: {
        address: CONTRACT_ADDRESSES.WETH,
        symbol: "WETH",
        name: "Wrapped Ether",
        decimals: 18,
        icon: "🔷",
    },
    USDC: {
        address: CONTRACT_ADDRESSES.USDC,
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        icon: "💰",
    },
    DAI: {
        address: CONTRACT_ADDRESSES.DAI,
        symbol: "DAI",
        name: "Dai Stablecoin",
        decimals: 18,
        icon: "🟡",
    },
} as const;

// Simple ERC20 ABI for balance queries
export const ERC20_ABI = [
    {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "symbol",
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
    },
] as const;
