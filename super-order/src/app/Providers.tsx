"use client";

/**
 * Providers Component
 *
 * Central provider composition that wraps the entire application with necessary contexts.
 * This follows the provider pattern to make various functionalities available throughout
 * the component tree without prop drilling.
 */

import { useRef } from "react";

// Web3 Integration
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { config, myTheme } from "@/lib/wallet/wagmi";

// Data Fetching
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "@/lib/get-query-client";

/**
 * Main Providers Wrapper
 *
 * Composes all application providers in the correct order to ensure proper
 * dependency resolution and context availability.
 *
 * Provider Stack (outer to inner):
 * 1. Redux - Global state management
 * 2. Wagmi - Web3 wallet connection and blockchain interaction
 * 3. React Query - Server state and data fetching
 * 4. RainbowKit - Wallet connection UI
 * 5. Router Transitions - Page transition animations
 * 6. Auth - User authentication state
 * 7. Tooltip - Global tooltip functionality
 *
 * @param children - React components to be wrapped with providers
 * @returns Fully wrapped application with all necessary providers
 */
interface ProvidersProps {
    children: React.ReactNode;
    initialState?: any;
}

export default function Providers({ children, initialState }: ProvidersProps) {
    const queryClient = getQueryClient();

    return (
        <WagmiProvider config={config} initialState={initialState}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    modalSize="compact"
                    showRecentTransactions={false}
                    theme={myTheme}
                >
                    {children}
                </RainbowKitProvider>

                <ReactQueryDevtools
                    initialIsOpen={false}
                    client={queryClient}
                />
            </QueryClientProvider>
        </WagmiProvider>
    );
}
