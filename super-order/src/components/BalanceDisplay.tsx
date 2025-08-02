"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { TOKENS, ERC20_ABI } from "@/lib/contracts";

interface BalanceDisplayProps {
    className?: string;
    showTitle?: boolean;
}

export function BalanceDisplay({ className = "", showTitle = true }: BalanceDisplayProps) {
    const { address, isConnected } = useAccount();

    // ETH Balance
    const { data: ethBalance } = useBalance({
        address: address,
    });

    // WETH Balance
    const { data: wethBalance } = useReadContract({
        address: TOKENS.WETH.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });


    // DAI Balance
    const { data: daiBalance } = useReadContract({
        address: TOKENS.DAI.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });

    if (!isConnected) {
        return (
            <div className={`bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 ${className}`}>
                <div className="text-center text-gray-400">
                    <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
                        💼
                    </div>
                    <p className="text-sm">Connect wallet to view balances</p>
                </div>
            </div>
        );
    }

    const formatBalance = (balance: bigint | undefined, decimals: number): string => {
        if (!balance) return "0.00";
        const formatted = formatUnits(balance, decimals);
        const num = parseFloat(formatted);
        
        console.log(`Balance formatting debug: ${formatted} -> ${num}`); // Debug log
        
        // Format with appropriate decimal places
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        } else if (num >= 1) {
            return num.toFixed(1);
        } else {
            return num.toFixed(4);
        }
    };

    return (
        <div className={`bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 ${className}`}>
            {showTitle && (
                <div className="flex items-center space-x-2 mb-4">
                    <div className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        💼
                    </div>
                    <h4 className="text-sm font-medium text-gray-200">Asset Balances</h4>
                </div>
            )}

            <div className="space-y-3">
                {/* ETH Balance */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <span className="text-lg">💎</span>
                        <span className="text-gray-300 text-sm font-medium">ETH</span>
                    </div>
                    <span className="text-white text-sm font-mono">
                        {ethBalance ? formatBalance(ethBalance.value, 18) : "0.00"}
                    </span>
                </div>

                {/* WETH Balance */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <span className="text-lg">{TOKENS.WETH.icon}</span>
                        <span className="text-gray-300 text-sm font-medium">{TOKENS.WETH.symbol}</span>
                    </div>
                    <span className="text-white text-sm font-mono">
                        {formatBalance(wethBalance as bigint, TOKENS.WETH.decimals)}
                    </span>
                </div>


                {/* DAI Balance */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <span className="text-lg">{TOKENS.DAI.icon}</span>
                        <span className="text-gray-300 text-sm font-medium">{TOKENS.DAI.symbol}</span>
                    </div>
                    <span className="text-white text-sm font-mono">
                        {formatBalance(daiBalance as bigint, TOKENS.DAI.decimals)}
                    </span>
                </div>
            </div>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-blue-400 text-xs font-medium">Live Balances</span>
                </div>
                <p className="text-gray-300 text-xs mt-1">
                    Real-time balance updates from Hardhat network
                </p>
            </div>
        </div>
    );
}