import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatUnits } from 'viem';
import { hardhat } from 'viem/chains';
import { ERC20_ABI } from '@/lib/contracts/config';

// Create a public client for reading balances
const publicClient = createPublicClient({
  chain: hardhat,
  transport: http('http://127.0.0.1:8545'),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const account = searchParams.get('account');

    if (!token || !account) {
      return NextResponse.json(
        { error: 'Token and account parameters are required' },
        { status: 400 }
      );
    }

    // Get token balance
    const balance = await publicClient.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account as `0x${string}`],
    });

    // Get token decimals
    const decimals = await publicClient.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    });

    const formattedBalance = formatUnits(balance, decimals);

    return NextResponse.json({
      token,
      account,
      balance: balance.toString(),
      decimals,
      formatted: formattedBalance,
    });
  } catch (error: any) {
    console.error('=== API Error: Fetching Balance ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Token:', token);
    console.error('Account:', account);
    return NextResponse.json(
      { error: 'Failed to fetch balance', details: error?.message },
      { status: 500 }
    );
  }
}