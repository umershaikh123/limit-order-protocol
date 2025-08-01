// Contract configuration with ABIs and addresses

// Import ABIs from JSON files
import ERC20Artifact from "./abi/ERC20.json";
import LimitOrderProtocolArtifact from "./abi/LimitOrderProtocol.json";
import StopLossV2Artifact from "./abi/StopLossMarketOrderV2.json";

// Export ABIs
export const ERC20_ABI = ERC20Artifact.abi;
export const LIMIT_ORDER_PROTOCOL_ABI = LimitOrderProtocolArtifact.abi;
export const STOP_LOSS_V2_ABI = StopLossV2Artifact.abi;

// Contract addresses from deployment
export const CONTRACT_ADDRESSES = {
    limitOrderProtocol: "0xf0014CBe67b3aB638bdaA2e2Cb1B531935829E50",
    weth: "0xFEE2d383Ee292283eC43bdf0fa360296BE1e1149",
    usdc: "0xE3e7A4B35574Ce4b9Bc661cD93e8804Da548932a",
    dai: "0xE1165C689C0c3e9642cA7606F5287e708d846206",
    stopLossV2: "0xdb88CFC18875e3eD6797de31dfAae31F942231F2",
    icebergV1: "0xD0725945859175dabd070855bC3F1c37a3aF605F",
    ocoV1: "0xC6c0E14c02C2dBd4f116230f01D03836620167B9",
    // Mock oracles for localhost
    ethOracle: "0x96e74d78A9EC0dB11C8c9fF2FD93bC98D8895B5A",
    usdcOracle: "0xEeED66583c579F3eEDF7270AE204419fE3fF09f5",
} as const;

// Chain configuration
export const CHAIN_ID = 31337; // Hardhat localhost
