import { NextRequest, NextResponse } from "next/server";

// Contract addresses from your deployment
const CONTRACT_ADDRESSES = {
    ethOracle: "0x96e74d78A9EC0dB11C8c9fF2FD93bC98D8895B5A",
    usdcOracle: "0xF2F7CE68C99D40B38fCBf67C8159011d8CD80E39",
    daiOracle: "0xF2F7CE68C99D40B38fCBf67C8159011d8CD80E39", // Using same as USDC for demo
};

// GET /api/debug/oracle-prices - Get current oracle prices
export async function GET(request: NextRequest) {
    try {
        console.log("=== API: Getting Oracle Prices ===");

        // For now, return mock prices since we need to interact with contracts
        // In a real implementation, you'd read from the actual oracle contracts
        const currentPrices = {
            wethPrice: "4000.0",
            usdcPrice: "0.00025",
            daiPrice: "0.00025",
            lastUpdated: new Date().toISOString(),
            oracleAddresses: CONTRACT_ADDRESSES,
        };

        console.log("Current oracle prices:", currentPrices);

        return NextResponse.json(currentPrices, { status: 200 });
    } catch (error: any) {
        console.error("=== API Error: Getting Oracle Prices ===");
        console.error("Error object:", error);
        console.error("Error message:", error?.message);
        console.error("Error stack:", error?.stack);

        return NextResponse.json(
            {
                success: false,
                error: "Failed to get oracle prices",
                details: error?.message,
            },
            { status: 500 }
        );
    }
}

// POST /api/debug/oracle-prices - Update oracle prices
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log("=== API: Real Oracle Price Update ===");
        console.log("New prices:", body);

        const { wethPrice, usdcPrice, daiPrice } = body;

        // Validate input prices
        if (!wethPrice || !usdcPrice || !daiPrice) {
            return NextResponse.json(
                { error: "Missing required price parameters" },
                { status: 400 }
            );
        }

        const ethers = require("ethers");

        // Connect to Hardhat localhost (ethers v5 syntax with network config)
        // const provider = new ethers.providers.JsonRpcProvider({
        //   url: 'http://127.0.0.1:8545',
        //   timeout: 30000,
        // }, {
        //   name: 'hardhat',
        //   chainId: 31337,
        // });

        const provider = new ethers.providers.JsonRpcProvider(
            "http://127.0.0.1:8545"
        );

        console.log("provider", provider);

        // Use deployer account
        const DEPLOYER_PRIVATE_KEY =
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        const deployerWallet = new ethers.Wallet(
            DEPLOYER_PRIVATE_KEY,
            provider
        );

        // Oracle addresses from your deployment
        const ETH_ORACLE = "0x96e74d78A9EC0dB11C8c9fF2FD93bC98D8895B5A";
        const USDC_ORACLE = "0xEeED66583c579F3eEDF7270AE204419fE3fF09f5";

        // Oracle interface - simple MockV3Aggregator
        const oracleAbi = [
            "function updateAnswer(int256 _answer)",
            "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
            "function decimals() view returns (uint8)",
        ];

        // Connect to oracles
        const ethOracle = new ethers.Contract(
            ETH_ORACLE,
            oracleAbi,
            deployerWallet
        );
        const usdcOracle = new ethers.Contract(
            USDC_ORACLE,
            oracleAbi,
            deployerWallet
        );

        console.log("🔄 Updating on-chain oracle prices...");

        try {
            // Use spawn to execute Hardhat script instead of direct ethers connection
            const { spawn } = require('child_process');
            const path = require('path');
            
            console.log('🔧 Executing oracle update via Hardhat script...');
            
            // Create a promise to handle the script execution
            const executeScript = () => {
                return new Promise((resolve, reject) => {
                    // Write oracle prices to temp file for script to read
                    const fs = require('fs');
                    const tempPath = path.join(process.cwd(), '../temp-oracle-prices.json');
                    
                    const oracleData = {
                        ethPrice: wethPrice,
                        usdcPrice: usdcPrice,
                        daiPrice: daiPrice,
                        ethOracle: ETH_ORACLE,
                        usdcOracle: USDC_ORACLE,
                    };
                    
                    fs.writeFileSync(tempPath, JSON.stringify(oracleData, null, 2));
                    
                    // Execute the Hardhat script
                    const scriptPath = path.join(process.cwd(), '../scripts/update-oracle-prices.js');
                    const child = spawn('npx', ['hardhat', 'run', scriptPath], {
                        cwd: path.join(process.cwd(), '..'),
                        stdio: 'pipe',
                    });
                    
                    let output = '';
                    let errorOutput = '';
                    
                    child.stdout.on('data', (data) => {
                        output += data.toString();
                        console.log('Script output:', data.toString());
                    });
                    
                    child.stderr.on('data', (data) => {
                        errorOutput += data.toString();
                        console.error('Script error:', data.toString());
                    });
                    
                    child.on('close', (code) => {
                        // Clean up temp file
                        try {
                            fs.unlinkSync(tempPath);
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                        
                        if (code === 0) {
                            resolve({
                                success: true,
                                output,
                                ethTxHash: '0x' + Math.random().toString(16).substr(2, 40),
                                usdcTxHash: '0x' + Math.random().toString(16).substr(2, 40),
                            });
                        } else {
                            reject(new Error(`Script failed with code ${code}: ${errorOutput}`));
                        }
                    });
                    
                    child.on('error', (error) => {
                        reject(error);
                    });
                });
            };
            
            const scriptResult = await executeScript();
            
            const result = {
                success: true,
                message: "Oracle prices updated via Hardhat script!",
                scriptOutput: scriptResult.output,
                newPrices: {
                    wethPrice,
                    usdcPrice,
                    daiPrice,
                },
                updatedAt: new Date().toISOString(),
                note: "Oracle update executed via Hardhat script to avoid network detection issues",
            };

            console.log("✅ Oracle update result:", result);
            return NextResponse.json(result, { status: 200 });
            
        } catch (oracleError) {
            console.error("❌ Oracle update failed:", oracleError);
            return NextResponse.json(
                {
                    success: false,
                    error: "Failed to update oracles via script",
                    details: oracleError?.message,
                    reason: oracleError?.reason,
                },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error("=== API Error: Updating Oracle Prices ===");
        console.error("Error object:", error);
        console.error("Error message:", error?.message);
        console.error("Error stack:", error?.stack);

        return NextResponse.json(
            {
                success: false,
                error: "Failed to update oracle prices",
                details: error?.message,
            },
            { status: 500 }
        );
    }
}
