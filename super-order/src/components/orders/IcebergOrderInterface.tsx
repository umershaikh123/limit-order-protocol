"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { ContractStatus } from "@/components/ContractStatus";

type IcebergStrategy = "FIXED_SIZE" | "PERCENTAGE" | "ADAPTIVE" | "TIME_BASED";

export function IcebergOrderInterface() {
    const { address, isConnected } = useAccount();
    const [strategy, setStrategy] = useState<IcebergStrategy>("FIXED_SIZE");
    const [formData, setFormData] = useState({
        tokenPair: "WETH/USDC",
        totalAmount: "",
        limitPrice: "",
        chunkSize: "",
        maxVisiblePercent: "10",
        revealInterval: "300", // 5 minutes
    });

    const strategies = [
        {
            id: "FIXED_SIZE" as const,
            name: "Fixed Size",
            description: "Consistent chunk sizes throughout execution",
            icon: "📏",
            color: "blue",
        },
        {
            id: "PERCENTAGE" as const,
            name: "Percentage",
            description: "Dynamic chunks based on remaining amount",
            icon: "📊",
            color: "green",
        },
        {
            id: "ADAPTIVE" as const,
            name: "Adaptive",
            description: "Market-responsive sizing based on performance",
            icon: "🧠",
            color: "purple",
        },
        {
            id: "TIME_BASED" as const,
            name: "Time Based",
            description: "Increasing chunk sizes over time (urgency)",
            icon: "⏱️",
            color: "orange",
        },
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Creating iceberg order:", { strategy, ...formData });
        // TODO: Integrate with contract
    };

    if (!isConnected) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-8 text-center">
                    <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-8 h-8 text-purple-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-200 mb-2">
                        Connect Wallet Required
                    </h3>
                    <p className="text-gray-400">
                        Please connect your wallet to create iceberg orders
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Strategy Selection */}
                <div className="lg:col-span-1">
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                <svg
                                    className="w-6 h-6 text-purple-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-purple-400">
                                    Strategy
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Choose reveal method
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {strategies.map((strategyOption) => (
                                <button
                                    key={strategyOption.id}
                                    onClick={() =>
                                        setStrategy(strategyOption.id)
                                    }
                                    className={`w-full p-4 rounded-lg border transition-all text-left ${
                                        strategy === strategyOption.id
                                            ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                                            : "border-gray-700 text-gray-400 hover:border-purple-500/30 hover:text-purple-400"
                                    }`}
                                >
                                    <div className="flex items-start space-x-3">
                                        <span className="text-xl">
                                            {strategyOption.icon}
                                        </span>
                                        <div>
                                            <div className="font-medium">
                                                {strategyOption.name}
                                            </div>
                                            <div className="text-xs opacity-75 mt-1">
                                                {strategyOption.description}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Order Form */}
                <div className="lg:col-span-1">
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">🧊</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-purple-400">
                                    Iceberg Order
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Progressive order revelation
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Token Pair */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Token Pair
                                </label>
                                <select
                                    value={formData.tokenPair}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            tokenPair: e.target.value,
                                        })
                                    }
                                    className="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                                >
                                    <option value="WETH/USDC">WETH/USDC</option>
                                    <option value="WETH/DAI">WETH/DAI</option>
                                    <option value="WBTC/USDC">WBTC/USDC</option>
                                </select>
                            </div>

                            {/* Total Amount */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Total Amount
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.totalAmount}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                totalAmount: e.target.value,
                                            })
                                        }
                                        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none pr-16"
                                    />
                                    <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                        WETH
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Total order size (will be revealed
                                    progressively)
                                </p>
                            </div>

                            {/* Limit Price */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Limit Price
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.limitPrice}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                limitPrice: e.target.value,
                                            })
                                        }
                                        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none pr-16"
                                    />
                                    <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                        USDC
                                    </span>
                                </div>
                            </div>

                            {/* Strategy-specific parameters */}
                            {strategy === "FIXED_SIZE" && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Chunk Size
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={formData.chunkSize}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    chunkSize: e.target.value,
                                                })
                                            }
                                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none pr-16"
                                        />
                                        <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                            WETH
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Fixed size for each revealed chunk
                                    </p>
                                </div>
                            )}

                            {strategy === "PERCENTAGE" && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Visible Percentage
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="10"
                                            value={formData.maxVisiblePercent}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    maxVisiblePercent:
                                                        e.target.value,
                                                })
                                            }
                                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none pr-8"
                                        />
                                        <span className="absolute right-2 top-2 text-gray-400 text-sm">
                                            %
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Percentage of remaining amount to reveal
                                    </p>
                                </div>
                            )}

                            {/* Reveal Interval */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Reveal Interval
                                </label>
                                <select
                                    value={formData.revealInterval}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            revealInterval: e.target.value,
                                        })
                                    }
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                                >
                                    <option value="300">5 minutes</option>
                                    <option value="600">10 minutes</option>
                                    <option value="900">15 minutes</option>
                                    <option value="1800">30 minutes</option>
                                </select>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="w-full py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white transition-all"
                            >
                                Create Iceberg Order
                            </button>
                        </form>
                    </div>
                </div>

                {/* Order Preview & Info */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Balance Display */}
                    <BalanceDisplay />
                    
                    {/* Contract Status */}
                    <ContractStatus />
                    {/* Order Preview */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-gray-200 mb-4">
                            Order Preview
                        </h4>

                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Strategy:</span>
                                <span className="text-purple-400">
                                    {strategy.replace("_", " ")}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">
                                    Total Amount:
                                </span>
                                <span className="text-white">
                                    {formData.totalAmount || "0.00"} WETH
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">
                                    Limit Price:
                                </span>
                                <span className="text-white">
                                    ${formData.limitPrice || "0.00"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">
                                    First Chunk:
                                </span>
                                <span className="text-white">
                                    {strategy === "PERCENTAGE"
                                        ? `${formData.maxVisiblePercent}% of total`
                                        : `${
                                              formData.chunkSize || "0.00"
                                          } WETH`}
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="text-xl">🕵️</span>
                                <span className="text-purple-400 text-sm font-medium">
                                    Stealth Execution
                                </span>
                            </div>
                            <p className="text-gray-300 text-xs">
                                Only small chunks visible at any time,
                                preventing market impact and front-running.
                            </p>
                        </div>
                    </div>

                    {/* Strategy Info */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-gray-200 mb-4">
                            {strategies.find((s) => s.id === strategy)?.name}{" "}
                            Strategy
                        </h4>

                        <div className="space-y-3 text-sm">
                            {strategy === "FIXED_SIZE" && (
                                <>
                                    <p className="text-gray-300">
                                        Reveals consistent chunk sizes
                                        throughout execution.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Predictable execution pattern
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Best for consistent market
                                                conditions
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {strategy === "PERCENTAGE" && (
                                <>
                                    <p className="text-gray-300">
                                        Dynamic chunks based on remaining
                                        amount.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Chunks decrease as order fills
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Maintains percentage visibility
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {strategy === "ADAPTIVE" && (
                                <>
                                    <p className="text-gray-300">
                                        Market-responsive chunk sizing based on
                                        fill performance.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Increases size if filling slowly
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Decreases size if filling
                                                quickly
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {strategy === "TIME_BASED" && (
                                <>
                                    <p className="text-gray-300">
                                        Chunk sizes increase over time
                                        (urgency-based).
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Gradual urgency increase
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Time-sensitive execution
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
