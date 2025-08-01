"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { StopLossOrderInterface } from "@/components/orders/StopLossOrderInterface";
import { IcebergOrderInterface } from "@/components/orders/IcebergOrderInterface";
import { OCOOrderInterface } from "@/components/orders/OCOOrderInterface";
import { Navigation } from "@/components/Navigation";
import { HeaderBalance } from "@/components/HeaderBalance";
import { toast } from "sonner";
import Link from "next/link";
type OrderType = "stop-loss" | "iceberg" | "oco";

export default function Home() {
    const [activeOrder, setActiveOrder] = useState<OrderType>("stop-loss");

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
            {/* Header */}
            <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div>
                                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                    SuperOrder
                                </h1>
                                <p className="text-xs text-gray-400">
                                    Advanced Trading on 1inch Protocol
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link
                                href="/orders"
                                className="text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-lg hover:bg-blue-500/30 transition-colors"
                            >
                                My Orders
                            </Link>
                            <Link
                                href="/debug"
                                className="text-sm bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-2 rounded-lg hover:bg-orange-500/30 transition-colors"
                            >
                                🐛 Debug
                            </Link>
                            <HeaderBalance />
                            <ConnectButton />
                        </div>
                    </div>
                </div>
            </header>

            <div className="container mx-auto px-6 py-8">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Advanced Order Types for DeFi
                    </h2>
                    <p className="text-gray-300 text-lg max-w-3xl mx-auto">
                        Experience institutional-grade trading features
                        previously only available on centralized exchanges.
                        Built on the 1inch Limit Order Protocol with
                        production-ready smart contracts.
                    </p>
                </div>

                {/* Navigation */}
                <Navigation
                    activeOrder={activeOrder}
                    setActiveOrder={setActiveOrder}
                />

                {/* Order Interface */}
                <div className="mt-8">
                    {activeOrder === "stop-loss" && <StopLossOrderInterface />}
                    {activeOrder === "iceberg" && <IcebergOrderInterface />}
                    {activeOrder === "oco" && <OCOOrderInterface />}
                </div>

                {/* Features Grid */}
                <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-6">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
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
                        <h3 className="text-lg font-semibold text-blue-400 mb-2">
                            Stop Loss & Take Profit
                        </h3>
                        <p className="text-gray-300 text-sm">
                            Automated market orders with oracle integration. Set
                            your risk management parameters and let the protocol
                            handle execution.
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl p-6">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
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
                        <h3 className="text-lg font-semibold text-purple-400 mb-2">
                            Iceberg Orders
                        </h3>
                        <p className="text-gray-300 text-sm">
                            Progressive order revelation for large trades. Hide
                            your order size and execute institutional-grade
                            strategies.
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-pink-500/10 to-pink-600/5 border border-pink-500/20 rounded-xl p-6">
                        <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center mb-4">
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
                        <h3 className="text-lg font-semibold text-pink-400 mb-2">
                            OCO Orders
                        </h3>
                        <p className="text-gray-300 text-sm">
                            One Cancels Other orders for bracket trading. Set up
                            take profit and stop loss simultaneously with
                            automatic cancellation.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <footer className="mt-16 pt-8 border-t border-gray-800 text-center text-gray-400">
                    <p>
                        Built with 1inch Limit Order Protocol • Production-ready
                        smart contracts • Decentralized execution
                    </p>
                </footer>
            </div>
        </div>
    );
}
