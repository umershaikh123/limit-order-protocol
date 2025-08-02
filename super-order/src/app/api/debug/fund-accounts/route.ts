import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// POST /api/debug/fund-accounts - Fund all three demo accounts with DAI and WETH
export async function POST(request: NextRequest) {
  try {
    console.log('=== API: Fund All Demo Accounts ===');
    
    console.log('Funding all three demo accounts with DAI and WETH...');
    
    // Execute the actual Hardhat funding script
    const executeScript = async () => {
      try {
        const { stdout, stderr } = await execAsync('npx hardhat run scripts/fund-accounts-working-addresses.js', {
          cwd: process.cwd().replace('/super-order', '') // Navigate to project root (remove super-order if present)
        });
        
        console.log('Hardhat script output:', stdout);
        if (stderr) console.error('Hardhat script errors:', stderr);
        
        return {
          success: true,
          accounts: {
            taker: {
              address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
              balances: {
                ETH: '10000.0',
                WETH: '5.0',
                DAI: '10000.0'
              },
              role: 'Order Execution'
            },
            maker: {
              address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              balances: {
                ETH: '10000.0',
                WETH: '10.0',
                DAI: '5000.0'
              },
              role: 'Order Creation'
            },
            trader: {
              address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
              balances: {
                ETH: '10000.0',
                WETH: '3.0',
                DAI: '2000.0'
              },
              role: 'Alternative Trading'
            }
          },
          message: 'All three demo accounts funded with DAI and WETH using specific addresses',
          contractsDeployed: false, // Using existing deployed contracts
          contractAddresses: {
            limitOrderProtocol: "0xf0014CBe67b3aB638bdaA2e2Cb1B531935829E50",
            weth: "0xFEE2d383Ee292283eC43bdf0fa360296BE1e1149",
            usdc: "0xE3e7A4B35574Ce4b9Bc661cD93e8804Da548932a",
            dai: "0xE1165C689C0c3e9642cA7606F5287e708d846206"
          },
          scriptOutput: stdout
        };
      } catch (error) {
        console.error('Hardhat script execution failed:', error);
        throw error;
      }
    };
    
    try {
      const result = await executeScript();
      console.log('Funding result:', result);
      
      return NextResponse.json({
        success: true,
        message: 'Demo accounts funded successfully',
        result,
        timestamp: new Date().toISOString(),
      }, { status: 200 });
      
    } catch (scriptError) {
      console.error('Funding script failed:', scriptError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Account funding failed', 
          details: scriptError 
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('=== API Error: Fund Demo Accounts ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fund demo accounts', 
        details: error?.message 
      },
      { status: 500 }
    );
  }
}