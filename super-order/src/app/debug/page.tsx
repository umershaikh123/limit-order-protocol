'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Database, Trash2, RefreshCw, TrendingDown, TrendingUp, DollarSign, Search, FileText } from 'lucide-react';
import Link from 'next/link';

export default function DebugPage() {
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isFundingAccounts, setIsFundingAccounts] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txDetails, setTxDetails] = useState(null);
  const [isLoadingTx, setIsLoadingTx] = useState(false);
  
  // Oracle price management
  const [currentPrices, setCurrentPrices] = useState({
    wethPrice: '4000.0',
    usdcPrice: '0.00025',
    daiPrice: '0.00025',
  });
  const [newPrices, setNewPrices] = useState({
    wethPrice: '',
    usdcPrice: '',
    daiPrice: '',
  });

  // Load current oracle prices on component mount
  useEffect(() => {
    loadCurrentPrices();
  }, []);

  const loadCurrentPrices = async () => {
    setIsLoadingPrices(true);
    try {
      const response = await fetch('/api/debug/oracle-prices');
      if (response.ok) {
        const prices = await response.json();
        setCurrentPrices(prices);
        // Set new prices to current for easy editing
        setNewPrices({
          wethPrice: prices.wethPrice,
          usdcPrice: prices.usdcPrice,
          daiPrice: prices.daiPrice,
        });
      }
    } catch (error) {
      console.error('Error loading oracle prices:', error);
    } finally {
      setIsLoadingPrices(false);
    }
  };

  const updateOraclePrices = async () => {
    setIsUpdatingPrice(true);
    toast.loading('Updating oracle prices...', { id: 'update-prices' });

    try {
      const response = await fetch('/api/debug/oracle-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPrices),
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentPrices(result.newPrices);
        toast.success('Oracle prices updated successfully!', { id: 'update-prices' });
        console.log('Price update result:', result);
      } else {
        const error = await response.text();
        console.error('Failed to update prices:', error);
        toast.error('Failed to update oracle prices', { id: 'update-prices' });
      }
    } catch (error) {
      console.error('Error updating prices:', error);
      toast.error('Error updating oracle prices', { id: 'update-prices' });
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const simulatePriceDrop = () => {
    // Simulate a significant price drop to trigger stop losses
    setNewPrices({
      wethPrice: '3000.0', // Drop from ~4000 to 3000
      usdcPrice: '0.000333', // Equivalent adjustment
      daiPrice: '0.000333',
    });
    toast.info('Price drop simulation loaded. Click "Update Prices" to apply.');
  };

  const simulatePriceRise = () => {
    // Simulate a price rise to trigger take profit orders
    setNewPrices({
      wethPrice: '5000.0', // Rise from ~4000 to 5000
      usdcPrice: '0.0002', // Equivalent adjustment
      daiPrice: '0.0002',
    });
    toast.info('Price rise simulation loaded. Click "Update Prices" to apply.');
  };

  const resetPrices = () => {
    // Reset to default demo prices
    setNewPrices({
      wethPrice: '4000.0',
      usdcPrice: '0.00025',
      daiPrice: '0.00025',
    });
    toast.info('Default prices loaded. Click "Update Prices" to apply.');
  };

  const clearDatabase = async () => {
    if (!confirm('⚠️ Are you sure you want to clear ALL order data from the database? This action cannot be undone.')) {
      return;
    }

    setIsClearing(true);
    toast.loading('Clearing database...', { id: 'clear-db' });

    try {
      const response = await fetch('/api/debug/clear-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Database cleared:', result);
        toast.success(`Database cleared successfully! Deleted ${result.deletedOrders} orders and ${result.deletedEvents} events.`, {
          id: 'clear-db',
        });
      } else {
        const error = await response.text();
        console.error('Failed to clear database:', error);
        toast.error('Failed to clear database', { id: 'clear-db' });
      }
    } catch (error) {
      console.error('Error clearing database:', error);
      toast.error('Error clearing database', { id: 'clear-db' });
    } finally {
      setIsClearing(false);
    }
  };

  const refreshPrismaClient = async () => {
    setIsRefreshing(true);
    toast.loading('Refreshing Prisma client...', { id: 'refresh-prisma' });

    try {
      const response = await fetch('/api/debug/refresh-prisma', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast.success('Prisma client refreshed successfully!', { id: 'refresh-prisma' });
      } else {
        toast.error('Failed to refresh Prisma client', { id: 'refresh-prisma' });
      }
    } catch (error) {
      console.error('Error refreshing Prisma client:', error);
      toast.error('Error refreshing Prisma client', { id: 'refresh-prisma' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const fundAllAccounts = async () => {
    setIsFundingAccounts(true);
    toast.loading('Funding demo accounts...', { id: 'fund-accounts' });

    try {
      const response = await fetch('/api/debug/fund-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Account funding result:', result);
        toast.success('Demo accounts funded successfully!', { id: 'fund-accounts' });
      } else {
        const error = await response.text();
        console.error('Failed to fund accounts:', error);
        toast.error('Failed to fund demo accounts', { id: 'fund-accounts' });
      }
    } catch (error) {
      console.error('Error funding accounts:', error);
      toast.error('Error funding demo accounts', { id: 'fund-accounts' });
    } finally {
      setIsFundingAccounts(false);
    }
  };

  const fetchTransactionDetails = async () => {
    if (!txHash.trim()) {
      toast.error('Please enter a transaction hash');
      return;
    }

    setIsLoadingTx(true);
    toast.loading('Fetching transaction details...', { id: 'fetch-tx' });

    try {
      const response = await fetch(`/api/debug/transaction-details?hash=${txHash.trim()}`);
      
      if (response.ok) {
        const details = await response.json();
        setTxDetails(details);
        console.log('=== COMPLETE TRANSACTION DETAILS ===');
        console.log(JSON.stringify(details, null, 2));
        toast.success('Transaction details loaded! Check console for full details.', { id: 'fetch-tx' });
      } else {
        const error = await response.text();
        console.error('Failed to fetch transaction:', error);
        toast.error('Failed to fetch transaction details', { id: 'fetch-tx' });
      }
    } catch (error) {
      console.error('Error fetching transaction:', error);
      toast.error('Error fetching transaction details', { id: 'fetch-tx' });
    } finally {
      setIsLoadingTx(false);
    }
  };

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
                href="/"
                className="text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-lg hover:bg-blue-500/30 transition-colors"
              >
                Create Orders
              </Link>
              <Link
                href="/orders"
                className="text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-lg hover:bg-blue-500/30 transition-colors"
              >
                My Orders
              </Link>
              <span className="text-sm bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-2 rounded-lg">
                🐛 Debug
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            🐛 Debug Tools
          </h2>
          <p className="text-gray-300 text-lg max-w-3xl mx-auto">
            Development utilities for testing and debugging the 1inch Limit Order Protocol integration
          </p>
        </div>

        <div className="grid gap-6">
          {/* Oracle Price Management */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-purple-400 mb-2 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Oracle Price Management
              </CardTitle>
              <CardDescription className="text-gray-300">
                Control Chainlink oracle prices to demonstrate stop loss triggering
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Prices Display */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <div className="text-xs text-purple-300 mb-1">WETH/USD Price</div>
                  <div className="text-2xl font-bold text-white">
                    ${isLoadingPrices ? '...' : currentPrices.wethPrice}
                  </div>
                </div>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="text-xs text-blue-300 mb-1">USDC/ETH Rate</div>
                  <div className="text-lg font-bold text-white">
                    {isLoadingPrices ? '...' : currentPrices.usdcPrice}
                  </div>
                </div>
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="text-xs text-green-300 mb-1">DAI/ETH Rate</div>
                  <div className="text-lg font-bold text-white">
                    {isLoadingPrices ? '...' : currentPrices.daiPrice}
                  </div>
                </div>
              </div>

              {/* Price Update Controls */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="wethPrice" className="text-white text-sm">
                      WETH/USD Price
                    </Label>
                    <Input
                      id="wethPrice"
                      type="number"
                      step="0.01"
                      value={newPrices.wethPrice}
                      onChange={(e) => setNewPrices(prev => ({ ...prev, wethPrice: e.target.value }))}
                      className="bg-black/40 border-white/20 text-white"
                      placeholder="4000.0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="usdcPrice" className="text-white text-sm">
                      USDC/ETH Rate
                    </Label>
                    <Input
                      id="usdcPrice"
                      type="number"
                      step="0.000001"
                      value={newPrices.usdcPrice}
                      onChange={(e) => setNewPrices(prev => ({ ...prev, usdcPrice: e.target.value }))}
                      className="bg-black/40 border-white/20 text-white"
                      placeholder="0.00025"
                    />
                  </div>
                  <div>
                    <Label htmlFor="daiPrice" className="text-white text-sm">
                      DAI/ETH Rate
                    </Label>
                    <Input
                      id="daiPrice"
                      type="number"
                      step="0.000001"
                      value={newPrices.daiPrice}
                      onChange={(e) => setNewPrices(prev => ({ ...prev, daiPrice: e.target.value }))}
                      className="bg-black/40 border-white/20 text-white"
                      placeholder="0.00025"
                    />
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button
                    onClick={simulatePriceDrop}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                  >
                    <TrendingDown className="h-4 w-4 mr-1" />
                    Price Drop
                  </Button>
                  <Button
                    onClick={simulatePriceRise}
                    variant="outline"
                    className="border-green-500/50 text-green-400 hover:bg-green-500/20"
                  >
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Price Rise
                  </Button>
                  <Button
                    onClick={resetPrices}
                    variant="outline"
                    className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={loadCurrentPrices}
                    variant="outline"
                    className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Reload
                  </Button>
                </div>

                {/* Update Price Button */}
                <Button
                  onClick={updateOraclePrices}
                  disabled={isUpdatingPrice}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {isUpdatingPrice ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Updating Prices...
                    </>
                  ) : (
                    <>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Update Oracle Prices
                    </>
                  )}
                </Button>
              </div>

              {/* Demo Instructions */}
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="text-sm text-blue-300">
                  <strong>📚 Demo Instructions:</strong>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
                    <li>Create a stop loss order with trigger price above current WETH price (e.g., 4500)</li>
                    <li>Use "Price Drop" to simulate market crash and trigger stop loss</li>
                    <li>Use "Price Rise" to simulate bull market and trigger take profit</li>
                    <li>Current price determines if orders can be executed</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Database Management */}
          <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Management
              </CardTitle>
              <CardDescription className="text-gray-300">
                Clear all orders and events from the database for fresh testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div className="text-sm text-red-300">
                  <strong>Warning:</strong> This will permanently delete all order data. Use only for development testing.
                </div>
              </div>
              
              <Button
                onClick={clearDatabase}
                disabled={isClearing}
                variant="destructive"
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Clearing Database...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Orders & Events
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Prisma Management */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-blue-400 mb-2 flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Prisma Client Management
              </CardTitle>
              <CardDescription className="text-gray-300">
                Refresh Prisma client connection and clear query cache
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={refreshPrismaClient}
                disabled={isRefreshing}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isRefreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Prisma Client
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-green-400 mb-2 flex items-center gap-2">
                ⚡ Quick Actions
              </CardTitle>
              <CardDescription className="text-gray-300">
                Fund all three demo accounts with DAI and WETH for complete testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/orders">
                  <Button variant="outline" className="w-full border-green-500/30 text-green-400 hover:bg-green-500/20">
                    View All Orders
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="w-full border-green-500/30 text-green-400 hover:bg-green-500/20">
                    Create New Order
                  </Button>
                </Link>
                <Button
                  onClick={fundAllAccounts}
                  disabled={isFundingAccounts}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isFundingAccounts ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Funding Accounts...
                    </>
                  ) : (
                    <>
                      💰 Fund All Demo Accounts
                    </>
                  )}
                </Button>
                <div className="text-xs text-green-300 col-span-2">
                  <div className="space-y-1">
                    <div><strong>Taker:</strong> 10K DAI + 5 WETH (Order Execution)</div>
                    <div><strong>Maker:</strong> 5K DAI + 10 WETH (Order Creation)</div>
                    <div><strong>Trader:</strong> 2K DAI + 3 WETH (Alternative)</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transaction Details */}
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                <Search className="h-5 w-5" />
                Transaction Details
              </CardTitle>
              <CardDescription className="text-gray-300">
                Get complete transaction details including logs, events, and gas analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="txHash" className="text-white text-sm">
                  Transaction Hash
                </Label>
                <Input
                  id="txHash"
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="bg-black/40 border-white/20 text-white font-mono"
                  placeholder="0x4d7d195e8cd1b85876f0dc05c6bffd257f3ffd45ed17eafa446e8bbdb0f5cda7"
                />
              </div>
              
              <Button
                onClick={fetchTransactionDetails}
                disabled={isLoadingTx}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
              >
                {isLoadingTx ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Fetching Details...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Get Transaction Details
                  </>
                )}
              </Button>

              {txDetails && (
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <div className="text-sm text-cyan-300">
                    <strong>📋 Transaction Found!</strong>
                    <div className="mt-2 space-y-1 text-xs">
                      <div>Status: <span className={`font-bold ${txDetails.analysis.success ? 'text-green-400' : 'text-red-400'}`}>
                        {txDetails.analysis.success ? '✅ Success' : '❌ Failed'}
                      </span></div>
                      <div>Gas Used: <span className="text-white">{txDetails.receipt.gasUsed}</span></div>
                      <div>Total Cost: <span className="text-white">{txDetails.analysis.totalCostEth} ETH</span></div>
                      <div>Events: <span className="text-white">{txDetails.analysis.eventCount}</span></div>
                      <div className="text-yellow-300 mt-2">
                        <strong>🔍 Full details logged to browser console!</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="text-sm text-blue-300">
                  <strong>📚 Quick Test:</strong>
                  <div className="mt-2 space-y-1 text-xs">
                    <div>• Paste your transaction hash above</div>
                    <div>• Click "Get Transaction Details"</div>
                    <div>• Check browser console for complete logs</div>
                    <div>• View parsed events and gas analysis</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Development Info */}
          <Card className="bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/20 rounded-xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-400 mb-2">📊 Environment Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Node Env:</span>
                  <span className="text-white ml-2">{process.env.NODE_ENV || 'development'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Database:</span>
                  <span className="text-green-400 ml-2">PostgreSQL</span>
                </div>
                <div>
                  <span className="text-gray-400">Network:</span>
                  <span className="text-blue-400 ml-2">Hardhat Localhost</span>
                </div>
                <div>
                  <span className="text-gray-400">Chain ID:</span>
                  <span className="text-purple-400 ml-2">31337</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}