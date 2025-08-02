"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { useEffect } from "react";
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

    // Debug logging for balance changes
    useEffect(() => {
        console.log("🔍 HeaderBalance Debug - Address Changed:", address);
        console.log("📄 Contract Addresses:", {
            WETH: TOKENS.WETH.address,
            DAI: TOKENS.DAI.address
        });
    }, [address]);

    useEffect(() => {
        if (ethBalance || wethBalance || daiBalance) {
            console.log("💰 HeaderBalance Debug - Raw Balance Data:", {
                address,
                ethBalance: ethBalance ? {
                    value: ethBalance.value?.toString(),
                    formatted: ethBalance.formatted
                } : null,
                wethBalance: wethBalance?.toString(),
                daiBalance: daiBalance?.toString()
            });

            // Test formatting logic
            if (wethBalance) {
                const wethFormatted = formatUnits(wethBalance, 18);
                const wethNum = parseFloat(wethFormatted);
                const displayValue = wethNum >= 1000000 ? (wethNum / 1000000).toFixed(1) + "M" :
                                   wethNum >= 1000 ? (wethNum / 1000).toFixed(1) + "K" :
                                   wethNum >= 1 ? wethNum.toFixed(1) : wethNum.toFixed(3);
                console.log("🔷 WETH Debug:", {
                    raw: wethBalance.toString(),
                    formatted: wethFormatted,
                    parsed: wethNum,
                    display: displayValue
                });
            }

            if (daiBalance) {
                const daiFormatted = formatUnits(daiBalance, 18);
                const daiNum = parseFloat(daiFormatted);
                const displayValue = daiNum >= 1000000 ? (daiNum / 1000000).toFixed(1) + "M" :
                                   daiNum >= 1000 ? (daiNum / 1000).toFixed(1) + "K" :
                                   daiNum >= 1 ? daiNum.toFixed(1) : daiNum.toFixed(3);
                console.log("🟡 DAI Debug:", {
                    raw: daiBalance.toString(),
                    formatted: daiFormatted,
                    parsed: daiNum,
                    display: displayValue
                });
            }
        }
    }, [ethBalance, wethBalance, daiBalance, address]);

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
            return num.toFixed(1);
        } else {
            return num.toFixed(3);
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
                <span className="text-yellow-400">🟡</span>
                <span className="text-gray-300">DAI:</span>
                <span className="text-white font-mono">
                    {formatBalance(daiBalance as bigint, 18)}
                </span>
            </div>

            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        </div>
    );
}