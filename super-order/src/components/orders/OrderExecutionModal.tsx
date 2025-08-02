"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { toast } from "sonner";
import { useOrderExecution } from "@/hooks/useOrderExecution";
import { CONTRACT_ADDRESSES } from "@/lib/contracts/config";

interface OrderData {
  id: string;
  orderHash: string;
  orderType: string;
  maker: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  salt: string;
  signature: string;
  triggerPrice: string | null;
  isStopLoss: boolean | null;
}

interface BalanceData {
  balance: string;
  decimals: number;
  formatted: string;
}

const TOKEN_SYMBOLS: { [key: string]: string } = {
  [CONTRACT_ADDRESSES.weth]: "WETH",
  [CONTRACT_ADDRESSES.dai]: "DAI",
};

interface OrderExecutionModalProps {
  order: OrderData;
  isOpen: boolean;
  onClose: () => void;
  onExecuted: (orderHash: string) => void;
}

export function OrderExecutionModal({ order, isOpen, onClose, onExecuted }: OrderExecutionModalProps) {
  const { address } = useAccount();
  const { executeOrder, updateOrderStatus, isLoading, isSuccess, txHash } = useOrderExecution();
  
  const [balances, setBalances] = useState<{
    makerBefore: BalanceData | null;
    takerBefore: BalanceData | null;
    makerAfter: BalanceData | null;
    takerAfter: BalanceData | null;
  }>({
    makerBefore: null,
    takerBefore: null,
    makerAfter: null,
    takerAfter: null,
  });

  const [amountToFill, setAmountToFill] = useState("");
  const [showResults, setShowResults] = useState(false);

  // Fetch balances before execution
  const fetchBalances = async (type: 'before' | 'after') => {
    if (!address) return;

    try {
      const [makerBalance, takerBalance] = await Promise.all([
        fetch(`/api/balance?token=${order.makerAsset}&account=${order.maker}`).then(r => r.json()),
        fetch(`/api/balance?token=${order.takerAsset}&account=${address}`).then(r => r.json()),
      ]);

      if (type === 'before') {
        setBalances(prev => ({
          ...prev,
          makerBefore: makerBalance,
          takerBefore: takerBalance,
        }));
      } else {
        setBalances(prev => ({
          ...prev,
          makerAfter: makerBalance,
          takerAfter: takerBalance,
        }));
      }
    } catch (error) {
      console.error(`Error fetching ${type} balances:`, error);
    }
  };

  // Fetch initial balances when modal opens
  useEffect(() => {
    if (isOpen && address) {
      fetchBalances('before');
      setShowResults(false);
      setAmountToFill("");
    }
  }, [isOpen, address, order]);

  // Handle successful execution
  useEffect(() => {
    if (isSuccess && txHash) {
      // Update order status in database
      updateOrderStatus(order.orderHash, 'filled', txHash);
      
      // Fetch balances after execution
      setTimeout(() => {
        fetchBalances('after');
        setShowResults(true);
        onExecuted(order.orderHash);
      }, 2000); // Wait for block confirmation
    }
  }, [isSuccess, txHash, order.orderHash]);

  const handleExecute = async () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    // Check if user is trying to execute their own order
    if (address.toLowerCase() === order.maker.toLowerCase()) {
      toast.error("You cannot execute your own order. Please switch to a different account to act as the taker.");
      return;
    }

    try {
      await executeOrder(order, amountToFill || undefined);
    } catch (error) {
      console.error("Execution failed:", error);
    }
  };

  const getTokenSymbol = (tokenAddress: string) => {
    return TOKEN_SYMBOLS[tokenAddress] || tokenAddress.slice(0, 6) + "...";
  };

  const formatTokenAmount = (amount: string, tokenAddress: string) => {
    const symbol = getTokenSymbol(tokenAddress);
    const decimals = symbol === "USDC" ? 6 : 18;
    return `${formatUnits(BigInt(amount), decimals)} ${symbol}`;
  };

  const calculateBalanceChange = (before: BalanceData | null, after: BalanceData | null) => {
    if (!before || !after) return "...";
    
    const change = BigInt(after.balance) - BigInt(before.balance);
    const formatted = formatUnits(change, before.decimals);
    const sign = change > 0n ? "+" : "";
    return `${sign}${formatted}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-gray-100">Execute Order</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Warning for self-execution */}
          {address && address.toLowerCase() === order.maker.toLowerCase() && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <h4 className="text-yellow-400 font-medium">Cannot Execute Own Order</h4>
                  <p className="text-yellow-300 text-sm mt-1">
                    Switch to a different account to act as the taker and execute this order.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Order Details */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-200 mb-3">Order Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Type:</span>
                <span className="ml-2 text-gray-200 capitalize">{order.orderType}</span>
              </div>
              <div>
                <span className="text-gray-400">Hash:</span>
                <span className="ml-2 text-gray-200 font-mono">{order.orderHash.slice(0, 10)}...</span>
              </div>
              <div>
                <span className="text-gray-400">Selling:</span>
                <span className="ml-2 text-gray-200">{formatTokenAmount(order.makingAmount, order.makerAsset)}</span>
              </div>
              <div>
                <span className="text-gray-400">For:</span>
                <span className="ml-2 text-gray-200">{formatTokenAmount(order.takingAmount, order.takerAsset)}</span>
              </div>
              {order.triggerPrice && (
                <div className="col-span-2">
                  <span className="text-gray-400">Trigger Price:</span>
                  <span className="ml-2 text-gray-200">
                    {order.triggerPrice} {getTokenSymbol(order.takerAsset)}/{getTokenSymbol(order.makerAsset)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Fill Amount Input */}
          {!showResults && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Amount to Fill (leave empty for full amount)
              </label>
              <input
                type="number"
                step="0.000001"
                placeholder="Optional - partial fill amount"
                value={amountToFill}
                onChange={(e) => setAmountToFill(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                disabled={isLoading}
              />
            </div>
          )}

          {/* Balance Information */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-200 mb-3">Balance Information</h3>
            
            {/* Before Execution */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Before Execution</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Maker {getTokenSymbol(order.makerAsset)}:</span>
                  <span className="ml-2 text-gray-200">
                    {balances.makerBefore ? balances.makerBefore.formatted : "Loading..."}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Your {getTokenSymbol(order.takerAsset)}:</span>
                  <span className="ml-2 text-gray-200">
                    {balances.takerBefore ? balances.takerBefore.formatted : "Loading..."}
                  </span>
                </div>
              </div>
            </div>

            {/* After Execution */}
            {showResults && (
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">After Execution</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Maker {getTokenSymbol(order.makerAsset)}:</span>
                    <span className="ml-2 text-gray-200">
                      {balances.makerAfter ? balances.makerAfter.formatted : "Loading..."}
                    </span>
                    <div className="text-xs text-green-400">
                      Change: {calculateBalanceChange(balances.makerBefore, balances.makerAfter)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Your {getTokenSymbol(order.takerAsset)}:</span>
                    <span className="ml-2 text-gray-200">
                      {balances.takerAfter ? balances.takerAfter.formatted : "Loading..."}
                    </span>
                    <div className="text-xs text-green-400">
                      Change: {calculateBalanceChange(balances.takerBefore, balances.takerAfter)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Execution Results */}
          {showResults && txHash && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <h3 className="text-lg font-medium text-green-400 mb-2">✅ Execution Successful!</h3>
              <div className="text-sm text-gray-300">
                <div className="mb-2">
                  <span className="text-gray-400">Transaction Hash:</span>
                  <span className="ml-2 font-mono text-green-400">{txHash}</span>
                </div>
                <div>
                  Order has been successfully executed and marked as filled in the database.
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!showResults ? (
              <>
                <button
                  onClick={handleExecute}
                  disabled={isLoading || (address && address.toLowerCase() === order.maker.toLowerCase())}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                    isLoading || (address && address.toLowerCase() === order.maker.toLowerCase())
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Executing Order...
                    </span>
                  ) : (
                    "Execute Order"
                  )}
                </button>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-6 py-3 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}