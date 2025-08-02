import { NextRequest, NextResponse } from 'next/server';

// POST /api/demo/execute-order - Execute order using demo funded account  
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('=== API: Real Order Execution ===');
    console.log('Request body:', body);
    
    const { orderHash, orderData, amountToFill } = body;
    
    if (!orderHash || !orderData) {
      return NextResponse.json(
        { error: 'Missing required parameters: orderHash and orderData' },
        { status: 400 }
      );
    }
    
    const ethers = require('ethers');
    const path = require('path');
    const fs = require('fs');
    
    console.log('Executing order on-chain via ethers.js...');
    console.log('Order Hash:', orderHash);
    
    // Connect to Hardhat localhost
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Use the funded taker account (signers[2])
    const TAKER_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
    const takerWallet = new ethers.Wallet(TAKER_PRIVATE_KEY, provider);
    
    console.log('Taker account:', takerWallet.address);
    
    // Load contract artifacts
    const limitOrderArtifactPath = path.join(process.cwd(), '../artifacts/contracts/LimitOrderProtocol.sol/LimitOrderProtocol.json');
    const limitOrderArtifact = JSON.parse(fs.readFileSync(limitOrderArtifactPath, 'utf8'));
    
    const erc20ArtifactPath = path.join(process.cwd(), '../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json');
    const erc20Artifact = JSON.parse(fs.readFileSync(erc20ArtifactPath, 'utf8'));
    
    // Contract addresses
    const CONTRACT_ADDRESSES = {
      limitOrderProtocol: '0xf0014CBe67b3aB638bdaA2e2Cb1B531935829E50',
      weth: '0xFEE2d383Ee292283eC43bdf0fa360296BE1e1149',
      usdc: '0xE3e7A4B35574Ce4b9Bc661cD93e8804Da548932a',
      dai: '0xE1165C689C0c3e9642cA7606F5287e708d846206',
    };
    
    // Create contract instances
    const limitOrderProtocol = new ethers.Contract(
      CONTRACT_ADDRESSES.limitOrderProtocol,
      limitOrderArtifact.abi,
      takerWallet
    );
    
    // Execute the real transaction
    const executeScript = async () => {
      try {
        console.log('=== Starting Real Transaction Execution ===');
        
        // Get token decimals
        const decimals = {
          [CONTRACT_ADDRESSES.weth]: 18,
          [CONTRACT_ADDRESSES.usdc]: 6,
          [CONTRACT_ADDRESSES.dai]: 18,
        };
        
        const makerDecimals = decimals[orderData.makerAsset] || 18;
        
        // Calculate fill amount (default to full order)
        const fillAmount = amountToFill 
          ? ethers.parseUnits(amountToFill, makerDecimals)
          : BigInt(orderData.makingAmount);
          
        console.log('Fill Amount:', fillAmount.toString());
        
        // Get balances before execution
        const wethContract = new ethers.Contract(CONTRACT_ADDRESSES.weth, erc20Artifact.abi, provider);
        const usdcContract = new ethers.Contract(CONTRACT_ADDRESSES.usdc, erc20Artifact.abi, provider);
        
        const traderWETHBefore = await wethContract.balanceOf(orderData.maker);
        const traderUSDCBefore = await usdcContract.balanceOf(orderData.maker);
        const takerWETHBefore = await wethContract.balanceOf(takerWallet.address);
        const takerUSDCBefore = await usdcContract.balanceOf(takerWallet.address);
        
        console.log('=== Balances Before ===');
        console.log('Trader WETH:', ethers.formatEther(traderWETHBefore));
        console.log('Trader USDC:', ethers.formatUnits(traderUSDCBefore, 6));
        console.log('Taker WETH:', ethers.formatEther(takerWETHBefore));
        console.log('Taker USDC:', ethers.formatUnits(takerUSDCBefore, 6));
        
        // Reconstruct the order structure with extension data
        const order = {
          salt: BigInt(orderData.salt),
          maker: orderData.maker,
          receiver: orderData.maker,
          makerAsset: orderData.makerAsset,
          takerAsset: orderData.takerAsset,
          makingAmount: BigInt(orderData.makingAmount),
          takingAmount: BigInt(orderData.takingAmount),
          makerTraits: BigInt(orderData.makerTraits || "0"),
          // Include extension data if present
          ...(orderData.makingAmountData && { makingAmountData: orderData.makingAmountData }),
          ...(orderData.takingAmountData && { takingAmountData: orderData.takingAmountData }),
        };
        
        console.log('Order structure:', order);
        
        // Convert signature to r, vs format
        const signature = orderData.signature.slice(2); // Remove 0x
        const r = `0x${signature.slice(0, 64)}`;
        const s = `0x${signature.slice(64, 128)}`;
        const v = parseInt(signature.slice(128, 130), 16);
        const vs = BigInt(s) | (BigInt(v - 27) << 255n);
        const vsHex = `0x${vs.toString(16).padStart(64, '0')}`;
        
        console.log('Signature components:', { r, vs: vsHex });
        
        // Build taker traits (no extension needed for execution)
        const TakerTraitsConstants = {
          _MAKER_AMOUNT_FLAG: 1n << 255n,
          _UNWRAP_WETH_FLAG: 1n << 254n,
          _SKIP_ORDER_PERMIT_FLAG: 1n << 253n,
          _USE_PERMIT2_FLAG: 1n << 252n,
          _ARGS_HAS_TARGET: 1n << 251n,
          _ARGS_EXTENSION_LENGTH_OFFSET: 224n,
          _ARGS_EXTENSION_LENGTH_MASK: 0xffffff,
          _ARGS_INTERACTION_LENGTH_OFFSET: 200n,
          _ARGS_INTERACTION_LENGTH_MASK: 0xffffff,
        };
        
        const takerTraits = 0n; // Simple taker traits with no extensions
        const takerArgs = '0x';
        
        console.log('Taker traits:', takerTraits.toString());
        console.log('Taker args:', takerArgs);
        
        // Execute the transaction
        console.log('=== Executing fillOrderArgs ===');
        const tx = await limitOrderProtocol.fillOrderArgs(
          order,
          r,
          vsHex,
          fillAmount,
          takerTraits,
          takerArgs
        );
        
        console.log('Transaction submitted:', tx.hash);
        console.log('Waiting for confirmation...');
        
        const receipt = await tx.wait();
        console.log('Transaction confirmed!');
        console.log('Gas used:', receipt.gasUsed.toString());
        
        // Get balances after execution
        const traderWETHAfter = await wethContract.balanceOf(orderData.maker);
        const traderUSDCAfter = await usdcContract.balanceOf(orderData.maker);
        const takerWETHAfter = await wethContract.balanceOf(takerWallet.address);
        const takerUSDCAfter = await usdcContract.balanceOf(takerWallet.address);
        
        console.log('=== Balances After ===');
        console.log('Trader WETH:', ethers.formatEther(traderWETHAfter));
        console.log('Trader USDC:', ethers.formatUnits(traderUSDCAfter, 6));
        console.log('Taker WETH:', ethers.formatEther(takerWETHAfter));
        console.log('Taker USDC:', ethers.formatUnits(takerUSDCAfter, 6));
        
        // Calculate balance changes
        const balanceChanges = {
          traderWETH: ethers.formatEther(traderWETHAfter - traderWETHBefore),
          traderUSDC: ethers.formatUnits(traderUSDCAfter - traderUSDCBefore, 6),
          takerWETH: ethers.formatEther(takerWETHAfter - takerWETHBefore),
          takerUSDC: ethers.formatUnits(takerUSDCAfter - takerUSDCBefore, 6),
        };
        
        console.log('=== Balance Changes ===');
        console.log('Trader WETH:', balanceChanges.traderWETH);
        console.log('Trader USDC:', balanceChanges.traderUSDC);
        console.log('Taker WETH:', balanceChanges.takerWETH);
        console.log('Taker USDC:', balanceChanges.takerUSDC);
        
        return {
          success: true,
          transactionHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          blockNumber: receipt.blockNumber,
          balanceChanges,
          logs: receipt.logs,
        };
        
      } catch (executionError) {
        console.error('Transaction execution failed:', executionError);
        throw executionError;
      }
    };
    
    try {
      const result = await executeScript();
      console.log('Real execution result:', result);
      
      // Update order status in database with real transaction hash
      const updateResponse = await fetch(`${request.nextUrl.origin}/api/orders`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderHash,
          status: 'filled',
          fillTxHash: result.transactionHash, // Use real transaction hash
          filledAmount: '100',
        }),
      });
      
      if (updateResponse.ok) {
        console.log('Order status updated in database with real tx hash:', result.transactionHash);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Order executed successfully on-chain!',
        result,
        realExecution: true,
        executorAccount: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        transactionHash: result.transactionHash,
        gasUsed: result.gasUsed,
        blockNumber: result.blockNumber,
        note: 'Real on-chain execution using funded taker account',
      }, { status: 200 });
      
    } catch (executionError) {
      console.error('Real execution failed:', executionError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Real order execution failed', 
          details: executionError?.message || executionError,
          code: executionError?.code,
          reason: executionError?.reason,
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('=== API Error: Demo Order Execution ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to execute demo order', 
        details: error?.message 
      },
      { status: 500 }
    );
  }
}