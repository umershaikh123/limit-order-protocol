"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

export function StopLossOrderInterface() {
    const { address, isConnected } = useAccount();
    const [orderType, setOrderType] = useState<"stop-loss" | "take-profit">(
        "stop-loss"
    );
    const [formData, setFormData] = useState({
        tokenPair: "WETH/USDC",
        amount: "",
        triggerPrice: "",
        slippage: "1",
        maxPriceDeviation: "5",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Creating stop loss order:", formData);
        // TODO: Integrate with contract
    };

    if (!isConnected) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-8 text-center">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-8 h-8 text-blue-400"
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
                        Please connect your wallet to create stop loss orders
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Order Form */}
                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-blue-400">
                                Stop Loss & Take Profit
                            </h3>
                            <p className="text-gray-400 text-sm">
                                Automated market orders with oracle integration
                            </p>
                        </div>
                    </div>

                    {/* Order Type Toggle */}
                    <div className="flex bg-gray-800/50 rounded-lg p-1 mb-6">
                        <button
                            onClick={() => setOrderType("stop-loss")}
                            className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                                orderType === "stop-loss"
                                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                    : "text-gray-400 hover:text-red-400"
                            }`}
                        >
                            Stop Loss
                        </button>
                        <button
                            onClick={() => setOrderType("take-profit")}
                            className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                                orderType === "take-profit"
                                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                    : "text-gray-400 hover:text-green-400"
                            }`}
                        >
                            Take Profit
                        </button>
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
                                className="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                            >
                                <option value="WETH/USDC">WETH/USDC</option>
                                <option value="WETH/DAI">WETH/DAI</option>
                                <option value="WBTC/USDC">WBTC/USDC</option>
                            </select>
                        </div>

                        {/* Amount */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Amount to Trade
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.amount}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            amount: e.target.value,
                                        })
                                    }
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none pr-16"
                                />
                                <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                    WETH
                                </span>
                            </div>
                        </div>

                        {/* Trigger Price */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                {orderType === "stop-loss"
                                    ? "Stop Price"
                                    : "Take Profit Price"}
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.triggerPrice}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            triggerPrice: e.target.value,
                                        })
                                    }
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none pr-16"
                                />
                                <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                    USDC
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                {orderType === "stop-loss"
                                    ? "Order executes when price falls below this level"
                                    : "Order executes when price rises above this level"}
                            </p>
                        </div>

                        {/* Advanced Settings */}
                        <div className="border-t border-gray-700 pt-4">
                            <h4 className="text-sm font-medium text-gray-300 mb-3">
                                Advanced Settings
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">
                                        Max Slippage
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={formData.slippage}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    slippage: e.target.value,
                                                })
                                            }
                                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none pr-8"
                                        />
                                        <span className="absolute right-2 top-2 text-gray-400 text-sm">
                                            %
                                        </span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">
                                        Price Deviation
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={formData.maxPriceDeviation}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    maxPriceDeviation:
                                                        e.target.value,
                                                })
                                            }
                                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none pr-8"
                                        />
                                        <span className="absolute right-2 top-2 text-gray-400 text-sm">
                                            %
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
                                orderType === "stop-loss"
                                    ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
                                    : "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                            }`}
                        >
                            Create{" "}
                            {orderType === "stop-loss"
                                ? "Stop Loss"
                                : "Take Profit"}{" "}
                            Order
                        </button>
                    </form>
                </div>

                {/* Order Preview & Info */}
                <div className="space-y-6">
                    {/* Order Preview */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-gray-200 mb-4">
                            Order Preview
                        </h4>

                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Type:</span>
                                <span
                                    className={
                                        orderType === "stop-loss"
                                            ? "text-red-400"
                                            : "text-green-400"
                                    }
                                >
                                    {orderType === "stop-loss"
                                        ? "Stop Loss"
                                        : "Take Profit"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Amount:</span>
                                <span className="text-white">
                                    {formData.amount || "0.00"} WETH
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">
                                    Trigger Price:
                                </span>
                                <span className="text-white">
                                    ${formData.triggerPrice || "0.00"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Slippage:</span>
                                <span className="text-white">
                                    {formData.slippage}%
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                                <svg
                                    className="w-4 h-4 text-blue-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <span className="text-blue-400 text-sm font-medium">
                                    Oracle Integration
                                </span>
                            </div>
                            <p className="text-gray-300 text-xs">
                                Uses Chainlink price feeds with TWAP protection
                                and 5-minute staleness checks for secure
                                execution.
                            </p>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-gray-200 mb-4">
                            Key Features
                        </h4>

                        <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-gray-300 text-sm">
                                    Automated market execution
                                </span>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-gray-300 text-sm">
                                    Oracle price manipulation protection
                                </span>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-gray-300 text-sm">
                                    Configurable slippage limits
                                </span>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-gray-300 text-sm">
                                    Multi-decimal token support
                                </span>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-gray-300 text-sm">
                                    Keeper network automation
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
