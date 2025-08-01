const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Deploying Advanced Order Extensions...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy WETH mock first
    console.log("🔄 Deploying WETH mock...");
    const WETH = await ethers.getContractFactory("WrappedTokenMock");
    const weth = await WETH.deploy("Wrapped Ether", "WETH");
    await weth.waitForDeployment();
    const wethAddress = await weth.getAddress();
    console.log("✅ WETH deployed to:", wethAddress);

    // Deploy LimitOrderProtocol with WETH address
    console.log("🔄 Deploying LimitOrderProtocol...");
    const LimitOrderProtocol = await ethers.getContractFactory("LimitOrderProtocol");
    const limitOrderProtocol = await LimitOrderProtocol.deploy(wethAddress);
    await limitOrderProtocol.waitForDeployment();
    const limitOrderProtocolAddress = await limitOrderProtocol.getAddress();
    console.log("✅ LimitOrderProtocol deployed to:", limitOrderProtocolAddress);

    const deployedContracts = {
        limitOrderProtocol: limitOrderProtocolAddress,
        WETH: wethAddress
    };

    // 1. Deploy StopLossMarketOrderV2
    console.log("🔄 Deploying StopLossMarketOrderV2...");
    const StopLossV2 = await ethers.getContractFactory("StopLossMarketOrderV2");
    const stopLossV2 = await StopLossV2.deploy(limitOrderProtocolAddress);
    await stopLossV2.waitForDeployment();
    const stopLossV2Address = await stopLossV2.getAddress();
    deployedContracts.stopLossV2 = stopLossV2Address;
    console.log("✅ StopLossMarketOrderV2 deployed to:", stopLossV2Address);

    // 2. Deploy IcebergOrderV1  
    console.log("🔄 Deploying IcebergOrderV1...");
    const IcebergV1 = await ethers.getContractFactory("IcebergOrderV1");
    const icebergV1 = await IcebergV1.deploy(limitOrderProtocolAddress);
    await icebergV1.waitForDeployment();
    const icebergV1Address = await icebergV1.getAddress();
    deployedContracts.icebergV1 = icebergV1Address;
    console.log("✅ IcebergOrderV1 deployed to:", icebergV1Address);

    // 3. Deploy OCOOrderV1
    console.log("🔄 Deploying OCOOrderV1...");
    const OCOV1 = await ethers.getContractFactory("OCOOrderV1");
    const ocoV1 = await OCOV1.deploy(limitOrderProtocolAddress);
    await ocoV1.waitForDeployment();
    const ocoV1Address = await ocoV1.getAddress();
    deployedContracts.ocoV1 = ocoV1Address;
    console.log("✅ OCOOrderV1 deployed to:", ocoV1Address);

    // 4. Deploy Mock Aggregation Router for testing
    console.log("🔄 Deploying MockAggregationRouter...");
    const MockRouter = await ethers.getContractFactory("MockAggregationRouter");
    const mockRouter = await MockRouter.deploy();
    await mockRouter.waitForDeployment();
    const mockRouterAddress = await mockRouter.getAddress();
    deployedContracts.mockRouter = mockRouterAddress;
    console.log("✅ MockAggregationRouter deployed to:", mockRouterAddress);

    // 5. Deploy additional test tokens (USDC, DAI)
    console.log("🔄 Deploying additional test tokens...");
    
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");

    const usdc = await ERC20Mock.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    deployedContracts.USDC = usdcAddress;
    console.log("✅ USDC deployed to:", usdcAddress);

    const dai = await ERC20Mock.deploy("Dai Stablecoin", "DAI", 18);
    await dai.waitForDeployment();
    const daiAddress = await dai.getAddress();
    deployedContracts.DAI = daiAddress;
    console.log("✅ DAI deployed to:", daiAddress);

    // 6. Deploy mock oracles
    console.log("🔄 Deploying mock price oracles...");
    const MockOracle = await ethers.getContractFactory("MockChainlinkOracle");
    
    const ethOracle = await MockOracle.deploy(8, "ETH/USD Price Feed");
    await ethOracle.waitForDeployment();
    const ethOracleAddress = await ethOracle.getAddress();
    deployedContracts.ethOracle = ethOracleAddress;
    // Set initial price: $4000 with 8 decimals
    await ethOracle.updateAnswer(400000000000);
    console.log("✅ ETH/USD Oracle deployed to:", ethOracleAddress);

    const usdcOracle = await MockOracle.deploy(8, "USDC/USD Price Feed");
    await usdcOracle.waitForDeployment();
    const usdcOracleAddress = await usdcOracle.getAddress();
    deployedContracts.usdcOracle = usdcOracleAddress;
    // Set initial price: $1.00 with 8 decimals
    await usdcOracle.updateAnswer(100000000);
    console.log("✅ USDC/USD Oracle deployed to:", usdcOracleAddress);

    // Mint test tokens to deployer for testing
    console.log("🔄 Minting test tokens...");
    // WETH is wrapped ETH, so we need to deposit ETH to get WETH
    await weth.deposit({ value: ethers.parseEther("1000") });
    await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6)); // 1M USDC
    await dai.mint(deployer.address, ethers.parseEther("1000000")); // 1M DAI
    console.log("✅ Test tokens minted to deployer");

    // Save deployment addresses
    const fs = require('fs');
    const deploymentData = {
        network: "localhost",
        chainId: 31337,
        deployedAt: new Date().toISOString(),
        contracts: deployedContracts
    };

    fs.writeFileSync(
        './deployments/localhost.json',
        JSON.stringify(deploymentData, null, 2)
    );

    console.log("\n🎉 All contracts deployed successfully!");
    console.log("📄 Deployment addresses saved to deployments/localhost.json");
    
    console.log("\n📋 Contract Addresses:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`${name.padEnd(20)}: ${address}`);
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    console.log("\n🔗 Next Steps:");
    console.log("1. Copy contract addresses to frontend environment");
    console.log("2. Import hardhat account #0 to MetaMask");
    console.log("3. Add localhost network to MetaMask (Chain ID: 31337)");
    console.log("4. Start frontend with: npm run dev");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });