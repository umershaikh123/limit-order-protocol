"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { TOKENS, ERC20_ABI } from "@/lib/contracts";

export function HeaderBalance() {
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

    // USDC Balance
    const { data: usdcBalance } = useReadContract({
        address: TOKENS.USDC.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });

    if (!isConnected) {
        return null;
    }

    const formatBalance = (balance: bigint | undefined, decimals: number): string => {
        if (!balance) return "0";
        const formatted = formatUnits(balance, decimals);
        const num = parseFloat(formatted);
        
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        } else if (num >= 1) {
            return num.toFixed(0);
        } else {
            return num.toFixed(2);
        }
    };

    return (
        <div className="hidden md:flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2 bg-gray-800/50 px-3 py-1.5 rounded-lg">
                <span className="text-blue-400">💎</span>
                <span className="text-gray-300">ETH:</span>
                <span className="text-white font-mono">
                    {ethBalance ? formatBalance(ethBalance.value, 18) : "0"}
                </span>
            </div>
            
            <div className="flex items-center space-x-2 bg-gray-800/50 px-3 py-1.5 rounded-lg">
                <span className="text-blue-400">🔷</span>
                <span className="text-gray-300">WETH:</span>
                <span className="text-white font-mono">
                    {formatBalance(wethBalance as bigint, 18)}
                </span>
            </div>
            
            <div className="flex items-center space-x-2 bg-gray-800/50 px-3 py-1.5 rounded-lg">
                <span className="text-green-400">💰</span>
                <span className="text-gray-300">USDC:</span>
                <span className="text-white font-mono">
                    {formatBalance(usdcBalance as bigint, 6)}
                </span>
            </div>

            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        </div>
    );
}