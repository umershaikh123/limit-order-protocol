import { useState, useEffect } from 'react';

// Demo accounts for Hardhat localhost
export const DEMO_ACCOUNTS = {
  maker: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    label: 'Maker (Trader)',
    funded: true,
  },
  taker: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    label: 'Taker (Executor)', 
    funded: true, // Funded with 200k USDC + 10 WETH
  },
  unfunded: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    label: 'Unfunded Account',
    funded: false,
  },
} as const;

export type DemoAccountKey = keyof typeof DEMO_ACCOUNTS;

export function useDemoAccounts() {
  const [currentAccount, setCurrentAccount] = useState<DemoAccountKey>('maker');
  
  const switchAccount = (accountKey: DemoAccountKey) => {
    setCurrentAccount(accountKey);
    console.log(`🔄 Switched to demo account: ${DEMO_ACCOUNTS[accountKey].label}`);
    console.log(`Address: ${DEMO_ACCOUNTS[accountKey].address}`);
    console.log(`Funded: ${DEMO_ACCOUNTS[accountKey].funded ? '✅' : '❌'}`);
  };

  const getCurrentAccount = () => {
    return DEMO_ACCOUNTS[currentAccount];
  };

  const isCurrentlyFunded = () => {
    return DEMO_ACCOUNTS[currentAccount].funded;
  };

  return {
    currentAccount,
    switchAccount,
    getCurrentAccount,
    isCurrentlyFunded,
    accounts: DEMO_ACCOUNTS,
  };
}