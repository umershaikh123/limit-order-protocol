import { NextRequest, NextResponse } from 'next/server';

// GET /api/debug/transaction-details?hash=0x... - Get full transaction details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const txHash = searchParams.get('hash');
    
    console.log('=== API: Get Transaction Details ===');
    console.log('Transaction Hash:', txHash);
    
    if (!txHash) {
      return NextResponse.json(
        { error: 'Missing transaction hash parameter' },
        { status: 400 }
      );
    }
    
    const ethers = require('ethers');
    
    // Connect to Hardhat localhost
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    try {
      // Get transaction details
      const tx = await provider.getTransaction(txHash);
      console.log('Raw Transaction:', tx);
      
      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      console.log('Transaction Receipt:', receipt);
      
      // Get block details
      let block = null;
      if (receipt?.blockNumber) {
        block = await provider.getBlock(receipt.blockNumber);
        console.log('Block Details:', block);
      }
      
      // Parse logs if available
      let parsedLogs = [];
      if (receipt?.logs) {
        // Import contract ABIs to parse logs
        const path = require('path');
        const fs = require('fs');
        
        try {
          // Load LimitOrderProtocol ABI
          const artifactPath = path.join(process.cwd(), '../artifacts/contracts/LimitOrderProtocol.sol/LimitOrderProtocol.json');
          const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
          const contractInterface = new ethers.Interface(artifact.abi);
          
          parsedLogs = receipt.logs.map((log, index) => {
            try {
              const parsed = contractInterface.parseLog(log);
              console.log(`Parsed Log ${index}:`, parsed);
              return {
                index,
                raw: log,
                parsed: {
                  name: parsed?.name,
                  signature: parsed?.signature,
                  args: parsed?.args ? Object.keys(parsed.args).reduce((acc, key) => {
                    if (isNaN(Number(key))) { // Only include named parameters
                      acc[key] = parsed.args[key]?.toString();
                    }
                    return acc;
                  }, {}) : {},
                }
              };
            } catch (parseError) {
              console.log(`Could not parse log ${index}:`, parseError.message);
              return {
                index,
                raw: log,
                parsed: null,
                parseError: parseError.message
              };
            }
          });
        } catch (abiError) {
          console.log('Could not load contract ABI:', abiError.message);
        }
      }
      
      // Get current block for confirmations
      const currentBlock = await provider.getBlockNumber();
      const confirmations = receipt ? currentBlock - receipt.blockNumber : 0;
      
      const result = {
        transaction: {
          hash: tx?.hash,
          from: tx?.from,
          to: tx?.to,
          value: tx?.value?.toString(),
          valueEth: tx?.value ? ethers.formatEther(tx.value) : '0',
          gasLimit: tx?.gasLimit?.toString(),
          gasPrice: tx?.gasPrice?.toString(),
          gasPriceGwei: tx?.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : '0',
          nonce: tx?.nonce,
          data: tx?.data,
          chainId: tx?.chainId,
          type: tx?.type,
        },
        receipt: {
          status: receipt?.status,
          blockNumber: receipt?.blockNumber,
          blockHash: receipt?.blockHash,
          transactionIndex: receipt?.transactionIndex,
          gasUsed: receipt?.gasUsed?.toString(),
          cumulativeGasUsed: receipt?.cumulativeGasUsed?.toString(),
          effectiveGasPrice: receipt?.effectiveGasPrice?.toString(),
          logsBloom: receipt?.logsBloom,
          logs: receipt?.logs,
          parsedLogs,
          confirmations,
        },
        block: block ? {
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
          dateTime: new Date(block.timestamp * 1000).toISOString(),
          miner: block.miner,
          gasLimit: block.gasLimit?.toString(),
          gasUsed: block.gasUsed?.toString(),
          baseFeePerGas: block.baseFeePerGas?.toString(),
        } : null,
        analysis: {
          success: receipt?.status === 1,
          gasEfficiency: receipt?.gasUsed && tx?.gasLimit ? 
            `${((Number(receipt.gasUsed) / Number(tx.gasLimit)) * 100).toFixed(2)}%` : 'N/A',
          totalCostEth: receipt?.gasUsed && receipt?.effectiveGasPrice ?
            ethers.formatEther(BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)) : '0',
          eventCount: receipt?.logs?.length || 0,
        }
      };
      
      console.log('=== Complete Transaction Analysis ===');
      console.log(JSON.stringify(result, null, 2));
      
      return NextResponse.json(result, { status: 200 });
      
    } catch (providerError) {
      console.error('Provider error:', providerError);
      return NextResponse.json(
        { 
          error: 'Failed to fetch transaction details', 
          details: providerError.message,
          hash: txHash
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('=== API Error: Transaction Details ===');
    console.error('Error object:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to get transaction details', 
        details: error?.message 
      },
      { status: 500 }
    );
  }
}