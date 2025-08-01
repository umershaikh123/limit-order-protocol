// wagmi.tsx

import { AvatarComponent, darkTheme, Theme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import {
  sepolia,
  holesky,
  berachainTestnetbArtio,
  optimism,
  arbitrum,
  polygon,
  mainnet,
  berachain,
  base,
  hardhat,
  localhost,
} from "wagmi/chains";
import merge from "lodash.merge";
import { createConfig, http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
  safeWallet,
  rabbyWallet,
  argentWallet,
  metaMaskWallet,
} from "@rainbow-me/rainbowkit/wallets";

const projectId =
  process.env.NEXT_PUBLIC_WALLET_ID || "dummy-project-id-for-build";

const Connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,
        walletConnectWallet,
        rainbowWallet,
        injectedWallet,
        safeWallet,
        rabbyWallet,
      ],
    },
  ],
  {
    appName: "SuperOrder - Advanced Trading",
    projectId,
  }
);

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export const config = createConfig({
  chains: [hardhat, localhost, mainnet, optimism, polygon, arbitrum, base],

  connectors: Connectors,
  ssr: false,

  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [localhost.id]: http("http://127.0.0.1:8545"),
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
  },
});

export const myTheme = merge(darkTheme(), {
  colors: {
    accentColor: "#8b5cf6", // Purple-500
    connectButtonBackground: "#1f2937", // Gray-800
    connectButtonInnerBackground: "#111827", // Gray-900
    modalBackground: "#0f172a", // Slate-900
    profileForeground: "#1f2937", // Gray-800
  },
  radii: {
    connectButton: "12px",
    modal: "16px",
  },
} as Theme);
