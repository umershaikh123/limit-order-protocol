"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { ContractStatus } from "@/components/ContractStatus";

type OCOStrategy = "BRACKET" | "BREAKOUT" | "RANGE";

export function OCOOrderInterface() {
    const { address, isConnected } = useAccount();
    const [strategy, setStrategy] = useState<OCOStrategy>("BRACKET");
    const [formData, setFormData] = useState({
        tokenPair: "WETH/USDC",
        amount: "",
        // For BRACKET (Take Profit + Stop Loss)
        takeProfitPrice: "",
        stopLossPrice: "",
        // For BREAKOUT (Buy High + Buy Low)
        buyHighPrice: "",
        buyLowPrice: "",
        // For RANGE (Sell High + Buy Low)
        sellHighPrice: "",
        buyLowPrice: "",
        maxGasPrice: "400",
    });

    const strategies = [
        {
            id: "BRACKET" as const,
            name: "Bracket",
            description: "Take Profit + Stop Loss",
            icon: "🎯",
            color: "blue",
            useCase: "Risk management with upside capture",
        },
        {
            id: "BREAKOUT" as const,
            name: "Breakout",
            description: "Buy High + Buy Low",
            icon: "📈",
            color: "green",
            useCase: "Momentum and mean reversion plays",
        },
        {
            id: "RANGE" as const,
            name: "Range",
            description: "Sell High + Buy Low",
            icon: "📊",
            color: "pink",
            useCase: "Range-bound market trading",
        },
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Creating OCO order:", { strategy, ...formData });
        // TODO: Integrate with contract
    };

    if (!isConnected) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-8 text-center">
                    <div className="w-16 h-16 bg-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-8 h-8 text-pink-400"
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
                        Please connect your wallet to create OCO orders
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
                            <div className="w-10 h-10 bg-pink-500/20 rounded-lg flex items-center justify-center">
                                <svg
                                    className="w-6 h-6 text-pink-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-pink-400">
                                    Strategy
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Choose OCO type
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
                                            ? "bg-pink-500/20 border-pink-500/50 text-pink-300"
                                            : "border-gray-700 text-gray-400 hover:border-pink-500/30 hover:text-pink-400"
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
                                            <div className="text-xs opacity-60 mt-1 italic">
                                                {strategyOption.useCase}
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
                            <div className="w-10 h-10 bg-pink-500/20 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">⚖️</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-pink-400">
                                    OCO Order
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    One cancels other
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
                                    className="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                                >
                                    <option value="WETH/USDC">WETH/USDC</option>
                                    <option value="WETH/DAI">WETH/DAI</option>
                                    <option value="WBTC/USDC">WBTC/USDC</option>
                                </select>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    {strategy === "BRACKET"
                                        ? "Position Size"
                                        : "Order Amount"}
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
                                        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 focus:outline-none pr-16"
                                    />
                                    <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                        {strategy === "BREAKOUT" ||
                                        strategy === "RANGE"
                                            ? "USDC"
                                            : "WETH"}
                                    </span>
                                </div>
                            </div>

                            {/* Strategy-specific price inputs */}
                            {strategy === "BRACKET" && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Take Profit Price
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={formData.takeProfitPrice}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        takeProfitPrice:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none pr-16"
                                            />
                                            <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                                USDC
                                            </span>
                                        </div>
                                        <p className="text-xs text-green-400 mt-1">
                                            Sell when price rises above this
                                            level
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Stop Loss Price
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={formData.stopLossPrice}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        stopLossPrice:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-red-500 focus:outline-none pr-16"
                                            />
                                            <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                                USDC
                                            </span>
                                        </div>
                                        <p className="text-xs text-red-400 mt-1">
                                            Sell when price falls below this
                                            level
                                        </p>
                                    </div>
                                </>
                            )}

                            {strategy === "BREAKOUT" && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Buy High Price
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={formData.buyHighPrice}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        buyHighPrice:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none pr-16"
                                            />
                                            <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                                USDC
                                            </span>
                                        </div>
                                        <p className="text-xs text-green-400 mt-1">
                                            Buy on bullish breakout
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Buy Low Price
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={formData.buyLowPrice}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        buyLowPrice:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none pr-16"
                                            />
                                            <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                                USDC
                                            </span>
                                        </div>
                                        <p className="text-xs text-blue-400 mt-1">
                                            Buy on dip (mean reversion)
                                        </p>
                                    </div>
                                </>
                            )}

                            {strategy === "RANGE" && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Sell High Price
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={formData.sellHighPrice}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        sellHighPrice:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-red-500 focus:outline-none pr-16"
                                            />
                                            <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                                USDC
                                            </span>
                                        </div>
                                        <p className="text-xs text-red-400 mt-1">
                                            Sell at resistance level
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Buy Low Price
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={formData.buyLowPrice}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        buyLowPrice:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none pr-16"
                                            />
                                            <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                                USDC
                                            </span>
                                        </div>
                                        <p className="text-xs text-green-400 mt-1">
                                            Buy at support level
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Max Gas Price */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Max Gas Price
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="1"
                                        value={formData.maxGasPrice}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                maxGasPrice: e.target.value,
                                            })
                                        }
                                        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 focus:outline-none pr-16"
                                    />
                                    <span className="absolute right-3 top-2 text-gray-400 text-sm">
                                        gwei
                                    </span>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="w-full py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white transition-all"
                            >
                                Create OCO Order
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
                                <span className="text-pink-400">
                                    {strategy}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Amount:</span>
                                <span className="text-white">
                                    {formData.amount || "0.00"}{" "}
                                    {strategy === "BREAKOUT" ||
                                    strategy === "RANGE"
                                        ? "USDC"
                                        : "WETH"}
                                </span>
                            </div>

                            {strategy === "BRACKET" && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Take Profit:
                                        </span>
                                        <span className="text-green-400">
                                            $
                                            {formData.takeProfitPrice || "0.00"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Stop Loss:
                                        </span>
                                        <span className="text-red-400">
                                            ${formData.stopLossPrice || "0.00"}
                                        </span>
                                    </div>
                                </>
                            )}

                            {strategy === "BREAKOUT" && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Buy High:
                                        </span>
                                        <span className="text-green-400">
                                            ${formData.buyHighPrice || "0.00"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Buy Low:
                                        </span>
                                        <span className="text-blue-400">
                                            ${formData.buyLowPrice || "0.00"}
                                        </span>
                                    </div>
                                </>
                            )}

                            {strategy === "RANGE" && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Sell High:
                                        </span>
                                        <span className="text-red-400">
                                            ${formData.sellHighPrice || "0.00"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Buy Low:
                                        </span>
                                        <span className="text-green-400">
                                            ${formData.buyLowPrice || "0.00"}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="mt-6 p-4 bg-pink-500/10 border border-pink-500/20 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="text-xl">⚡</span>
                                <span className="text-pink-400 text-sm font-medium">
                                    Auto Cancellation
                                </span>
                            </div>
                            <p className="text-gray-300 text-xs">
                                When one order executes, the other is
                                automatically cancelled by the keeper network.
                            </p>
                        </div>
                    </div>

                    {/* Strategy Explanation */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-gray-200 mb-4">
                            How It Works
                        </h4>

                        <div className="space-y-4 text-sm">
                            {strategy === "BRACKET" && (
                                <div>
                                    <h5 className="text-blue-400 font-medium mb-2">
                                        Bracket Trading
                                    </h5>
                                    <p className="text-gray-300 mb-3">
                                        Classic risk management strategy. Set
                                        both upside (take profit) and downside
                                        (stop loss) targets.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                If price rises → Take profit
                                                executes
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                If price falls → Stop loss
                                                executes
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Other order automatically
                                                cancelled
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {strategy === "BREAKOUT" && (
                                <div>
                                    <h5 className="text-green-400 font-medium mb-2">
                                        Breakout Strategy
                                    </h5>
                                    <p className="text-gray-300 mb-3">
                                        Capture momentum in either direction.
                                        Buy on breakout or mean reversion.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                High price → Momentum play
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Low price → Value opportunity
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {strategy === "RANGE" && (
                                <div>
                                    <h5 className="text-pink-400 font-medium mb-2">
                                        Range Trading
                                    </h5>
                                    <p className="text-gray-300 mb-3">
                                        Profit from sideways markets by selling
                                        at resistance and buying at support.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                High price → Sell at resistance
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            <span className="text-gray-300">
                                                Low price → Buy at support
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
