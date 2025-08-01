"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { toast } from "sonner";
import Link from "next/link";
import { OrderExecutionModal } from "@/components/orders/OrderExecutionModal";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { HeaderBalance } from "@/components/HeaderBalance";

interface Order {
  id: string;
  orderHash: string;
  orderType: string;
  maker: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  status: string;
  triggerPrice: string | null;
  isStopLoss: boolean | null;
  createdAt: string;
  executedAt: string | null;
  events: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    txHash: string | null;
  }>;
}

const TOKEN_SYMBOLS: { [key: string]: string } = {
  "0xFEE2d383Ee292283eC43bdf0fa360296BE1e1149": "WETH",
  "0xE3e7A4B35574Ce4b9Bc661cD93e8804Da548932a": "USDC",
  "0xE1165C689C0c3e9642cA7606F5287e708d846206": "DAI",
};

const TOKEN_DECIMALS: { [key: string]: number } = {
  WETH: 18,
  USDC: 6,
  DAI: 18,
};

export default function OrdersPage() {
  const { address, isConnected } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "filled" | "cancelled">("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showExecutionModal, setShowExecutionModal] = useState(false);

  // Fetch orders - get all orders, not just for current user
  const fetchOrders = async () => {
    if (!address) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") params.append("status", filter);
      // Don't filter by maker - show all orders so takers can see them

      const response = await fetch(`/api/orders?${params}`);
      const data = await response.json();
      setOrders(data);
    } catch (error: any) {
      console.error("=== Frontend Error: Fetching Orders ===");
      console.error("Error object:", error);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      console.error("Fetch URL:", `/api/orders?${params}`);
      toast.error(`Failed to fetch orders: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchOrders();
    }
  }, [isConnected, address, filter]);

  const getTokenSymbol = (address: string) => {
    return TOKEN_SYMBOLS[address] || address.slice(0, 6) + "...";
  };

  const formatAmount = (amount: string, tokenAddress: string) => {
    const symbol = getTokenSymbol(tokenAddress);
    const decimals = TOKEN_DECIMALS[symbol] || 18;
    return `${formatUnits(BigInt(amount), decimals)} ${symbol}`;
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      filled: "bg-green-500/20 text-green-400 border-green-500/30",
      cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
      expired: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${styles[status as keyof typeof styles] || styles.active}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const getOrderTypeBadge = (orderType: string) => {
    const styles = {
      "stop-loss": "bg-red-500/20 text-red-400 border-red-500/30",
      "take-profit": "bg-green-500/20 text-green-400 border-green-500/30",
      "iceberg": "bg-blue-500/20 text-blue-400 border-blue-500/30",
      "oco": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${styles[orderType as keyof typeof styles] || styles["stop-loss"]}`}>
        {orderType.toUpperCase()}
      </span>
    );
  };

  const handleExecuteOrder = (order: Order) => {
    setSelectedOrder(order);
    setShowExecutionModal(true);
  };

  const handleOrderExecuted = (orderHash: string) => {
    // Update the order status in the local state
    setOrders(prevOrders => 
      prevOrders.map(order => 
        order.orderHash === orderHash 
          ? { ...order, status: 'filled' }
          : order
      )
    );
    toast.success("Order executed successfully!");
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-200 mb-4">Connect Wallet</h2>
          <p className="text-gray-400">Please connect your wallet to view orders</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/" className="flex items-center space-x-3">
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    SuperOrder
                  </h1>
                  <p className="text-xs text-gray-400">
                    Advanced Trading on 1inch Protocol
                  </p>
                </div>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="text-sm bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-2 rounded-lg hover:bg-green-500/30 transition-colors"
              >
                Create Orders
              </Link>
              <HeaderBalance />
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-100">Order Management</h1>
          <p className="mt-2 text-gray-400">View and manage your limit orders</p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2">
          {["all", "active", "filled", "cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === status
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700/50"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Dynamic Help Section */}
        {orders.length > 0 && (
          <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-400 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-blue-400 font-medium mb-1">Order Execution</h3>
                <p className="text-blue-300 text-sm mb-2">
                  {orders.some(order => order.maker.toLowerCase() === address?.toLowerCase()) 
                    ? "You can see your created orders below. To execute them, switch to a different account (taker)."
                    : "You can execute orders created by other accounts. Click 'Execute' on any active order to proceed."
                  }
                </p>
                {orders.some(order => order.maker.toLowerCase() === address?.toLowerCase()) && (
                  <div className="text-xs text-blue-200 bg-blue-500/10 rounded p-2">
                    <strong>Switch to Taker Account:</strong><br/>
                    Private Key: <code className="bg-blue-500/20 px-1 rounded">0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d</code>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Orders Table */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-12 text-center">
            <h3 className="text-xl font-semibold text-gray-200 mb-2">No orders found</h3>
            <p className="text-gray-400">
              {filter === "all" 
                ? "You haven't created any orders yet" 
                : `No ${filter} orders found`}
            </p>
          </div>
        ) : (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Order Details
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {getOrderTypeBadge(order.orderType)}
                            {order.maker.toLowerCase() === address?.toLowerCase() && (
                              <span className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-md text-xs">
                                YOUR ORDER
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {order.orderHash.slice(0, 10)}...
                            </span>
                          </div>
                          <div className="text-sm text-gray-400">
                            {getTokenSymbol(order.makerAsset)} → {getTokenSymbol(order.takerAsset)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Maker: {order.maker.slice(0, 6)}...{order.maker.slice(-4)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-200">
                          {formatAmount(order.makingAmount, order.makerAsset)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-200">
                          {order.triggerPrice ? (
                            <>
                              {order.triggerPrice} {getTokenSymbol(order.takerAsset)}/{getTokenSymbol(order.makerAsset)}
                              <div className="text-xs text-gray-500">
                                {order.isStopLoss ? "Stop Loss" : "Take Profit"}
                              </div>
                            </>
                          ) : (
                            "-"
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-400">
                          {new Date(order.createdAt).toLocaleDateString()}
                          <div className="text-xs text-gray-500">
                            {new Date(order.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {order.status === "active" && (
                            <button
                              onClick={() => handleExecuteOrder(order)}
                              className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/30 text-sm"
                            >
                              Execute
                            </button>
                          )}
                          <button
                            onClick={() => {
                              // TODO: Implement cancel order
                              toast.info("Cancel order functionality coming soon!");
                            }}
                            className="px-3 py-1 bg-gray-600/20 text-gray-400 border border-gray-600/30 rounded-md hover:bg-gray-600/30 text-sm"
                            disabled={order.status !== "active"}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={fetchOrders}
            className="px-4 py-2 bg-gray-700/50 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-600/50 transition-colors"
          >
            Refresh Orders
          </button>
        </div>

        {/* Order Execution Modal */}
        {selectedOrder && (
          <OrderExecutionModal
            order={selectedOrder}
            isOpen={showExecutionModal}
            onClose={() => {
              setShowExecutionModal(false);
              setSelectedOrder(null);
            }}
            onExecuted={handleOrderExecuted}
          />
        )}
      </div>
    </div>
  );
}