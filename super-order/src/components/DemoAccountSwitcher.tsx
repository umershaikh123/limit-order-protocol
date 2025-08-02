'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, AlertCircle, CheckCircle } from 'lucide-react';
import { DEMO_ACCOUNTS, type DemoAccountKey, useDemoAccounts } from '@/hooks/useDemoAccounts';

export function DemoAccountSwitcher() {
  const { currentAccount, switchAccount, getCurrentAccount, isCurrentlyFunded } = useDemoAccounts();
  const [isExpanded, setIsExpanded] = useState(false);

  const currentAccountInfo = getCurrentAccount();

  return (
    <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-xl backdrop-blur-sm">
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <CardTitle className="text-lg font-semibold text-orange-400 mb-2 flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Demo Account Switcher
          <Badge variant={isCurrentlyFunded() ? "default" : "destructive"} className="ml-auto">
            {isCurrentlyFunded() ? "Funded" : "Unfunded"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-gray-300">
          Currently using: <strong>{currentAccountInfo.label}</strong>
          <br />
          <span className="text-xs text-gray-400">{currentAccountInfo.address}</span>
        </CardDescription>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-3">
          <div className="text-sm text-gray-300 mb-4">
            <AlertCircle className="h-4 w-4 inline mr-2 text-orange-400" />
            Switch between demo accounts for testing different roles
          </div>
          
          <div className="grid gap-3">
            {Object.entries(DEMO_ACCOUNTS).map(([key, account]) => (
              <div 
                key={key}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  currentAccount === key 
                    ? 'border-orange-500/50 bg-orange-500/20' 
                    : 'border-gray-500/20 bg-gray-500/10 hover:bg-gray-500/20'
                }`}
                onClick={() => switchAccount(key as DemoAccountKey)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white flex items-center gap-2">
                      {account.label}
                      {account.funded ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {account.address.slice(0, 10)}...{account.address.slice(-8)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={account.funded ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {account.funded ? "10K DAI + 10 WETH" : "Unfunded"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="text-sm text-blue-300">
              <strong>💡 MetaMask Setup Instructions:</strong>
              <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
                <li><strong>Import both accounts</strong> to MetaMask using private keys below</li>
                <li>Use <strong>Maker</strong> account to create stop loss orders</li>
                <li><strong>Switch MetaMask</strong> to Taker account to execute orders</li>
                <li>Taker account is pre-funded with 10,000 DAI + 10 WETH</li>
                <li>Order execution will be <strong>signed with MetaMask</strong></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="text-sm text-orange-300">
              <strong>🔑 Private Keys for MetaMask:</strong>
              <div className="mt-2 space-y-2 text-xs font-mono">
                <div>
                  <div className="text-orange-200 font-semibold">Maker (Trader):</div>
                  <div className="bg-black/30 p-2 rounded break-all">
                    0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
                  </div>
                </div>
                <div>
                  <div className="text-orange-200 font-semibold">Taker (Executor) - Funded:</div>
                  <div className="bg-black/30 p-2 rounded break-all">
                    0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/debug', '_blank')}
              className="flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
            >
              🛠️ Debug Tools
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('=== Current Demo Account Info ===');
                console.log('Account:', currentAccountInfo);
                console.log('Address:', currentAccountInfo.address);
                console.log('Private Key:', currentAccountInfo.privateKey);
                console.log('Funded:', currentAccountInfo.funded);
              }}
              className="flex-1 border-gray-500/30 text-gray-400 hover:bg-gray-500/20"
            >
              📋 Log Info
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}