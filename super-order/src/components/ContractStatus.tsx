"use client";

import { useAccount, useReadContract } from "wagmi";
import { CONTRACT_ADDRESSES, ERC20_ABI } from "@/lib/contracts";

export function ContractStatus() {
    const { address, isConnected, chain } = useAccount();

    // Test contract connectivity by reading WETH symbol
    const { data: wethSymbol } = useReadContract({
        address: CONTRACT_ADDRESSES.WETH as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
        query: {
            enabled: !!address,
        },
    });

    if (!isConnected) {
        return null;
    }

    const isHardhatNetwork = chain?.id === 31337;

    return (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
            <div className="flex items-center space-x-3 mb-3">
                <div className="w-6 h-6 bg-green-500/20 rounded-lg flex items-center justify-center">
                    🔗
                </div>
                <h4 className="text-sm font-medium text-gray-200">Contract Status</h4>
            </div>

            <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Network:</span>
                    <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${isHardhatNetwork ? 'bg-green-400' : 'bg-red-400'}`}></div>
                        <span className="text-white font-mono">
                            {isHardhatNetwork ? 'Hardhat Local' : chain?.name || 'Unknown'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Chain ID:</span>
                    <span className="text-white font-mono">{chain?.id || 'N/A'}</span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Contracts:</span>
                    <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${wethSymbol ? 'bg-green-400' : 'bg-red-400'}`}></div>
                        <span className="text-white font-mono">
                            {wethSymbol ? 'Connected' : 'Not Found'}
                        </span>
                    </div>
                </div>

                {isHardhatNetwork && wethSymbol && (
                    <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded-md">
                        <div className="flex items-center space-x-1">
                            <span className="text-green-400">✅</span>
                            <span className="text-green-400 text-xs font-medium">Ready for Testing</span>
                        </div>
                    </div>
                )}

                {!isHardhatNetwork && (
                    <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                        <div className="flex items-center space-x-1">
                            <span className="text-yellow-400">⚠️</span>
                            <span className="text-yellow-400 text-xs">Switch to Hardhat Network</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}