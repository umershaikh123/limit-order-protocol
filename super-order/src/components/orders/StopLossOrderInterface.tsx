"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useTokenApproval } from "@/hooks/useTokenApproval";
import { useStopLossOrder } from "@/hooks/useStopLossOrder";
import { toast } from "sonner";

export function StopLossOrderInterface() {
    const { address, isConnected } = useAccount();
    const [orderType, setOrderType] = useState<"stop-loss" | "take-profit">(
        "stop-loss"
    );
    const [formData, setFormData] = useState({
        tokenPair: "WETH/DAI",
        amount: "",
        triggerPrice: "",
        slippage: "1",
        maxPriceDeviation: "5",
    });

    // Get the selling token from the pair
    const sellToken = formData.tokenPair.split("/")[0] as
        | "WETH"
        | "DAI"
        | "USDC";

    // Token approval hook
    const {
        isApproved,
        handleApprove,
        isLoading: isApprovalLoading,
        allowance,
    } = useTokenApproval(sellToken);

    // Stop loss order hook
    const {
        createStopLossOrder,
        isLoading: isOrderLoading,
    } = useStopLossOrder();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.amount || !formData.triggerPrice) {
            toast.error("Please fill in all required fields");
            return;
        }

        console.log("=== Order Submission Debug ===");
        console.log("Current Allowance:", allowance, sellToken);
        console.log("Required Amount:", formData.amount, sellToken);

        // Check if token is approved
        if (!isApproved(formData.amount)) {
            await handleApprove(formData.amount);
            return;
        }

        // Create the actual order
        try {
            console.log("Creating stop loss order with params:", {
                ...formData,
                isStopLoss: orderType === "stop-loss"
            });
            
            await createStopLossOrder({
                tokenPair: formData.tokenPair,
                amount: formData.amount,
                triggerPrice: formData.triggerPrice,
                isStopLoss: orderType === "stop-loss",
                slippage: formData.slippage,
                maxPriceDeviation: formData.maxPriceDeviation,
            });
        } catch (error) {
            console.error("Order creation failed:", error);
        }
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
                            <div className="relative">
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
                                    <option value="WETH/DAI">WETH/DAI</option>
                                    <option value="DAI/WETH">DAI/WETH</option>
                                </select>
                                <div className="absolute right-3 top-2">
                                    <div className="flex items-center space-x-1">
                                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                        <span className="text-xs text-gray-400">Live</span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                Using Chainlink oracle feeds for reliable price data
                            </p>
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
                                    {sellToken}
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
                                    {formData.tokenPair.split("/")[1]}
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
                            disabled={isApprovalLoading || isOrderLoading}
                            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
                                isApprovalLoading || isOrderLoading
                                    ? "bg-gray-600 cursor-not-allowed"
                                    : orderType === "stop-loss"
                                    ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
                                    : "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                            }`}
                        >
                            {isApprovalLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg
                                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    Approving...
                                </span>
                            ) : isOrderLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg
                                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    Creating Order...
                                </span>
                            ) : !formData.amount ||
                              !isApproved(formData.amount) ? (
                                `Approve ${sellToken}`
                            ) : (
                                <>
                                    Create{" "}
                                    {orderType === "stop-loss"
                                        ? "Stop Loss"
                                        : "Take Profit"}{" "}
                                    Order
                                </>
                            )}
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
                                    {formData.amount || "0.00"} {sellToken}
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
