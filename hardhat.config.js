require("@matterlabs/hardhat-zksync-deploy");
require("@matterlabs/hardhat-zksync-solc");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
require("solidity-docgen");
require("hardhat-dependency-compiler");
require("hardhat-deploy");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("dotenv").config();
const { oneInchTemplates } = require("@1inch/solidity-utils/docgen");
const { Networks, getNetwork } = require("@1inch/solidity-utils/hardhat-setup");

if (getNetwork().indexOf("zksync") !== -1) {
    require("@matterlabs/hardhat-zksync-verify");
} else {
    require("@nomicfoundation/hardhat-verify");
}

const { networks, etherscan } = new Networks().registerAll();

const mainnetForkConfig = {
    mainnetFork: {
        url: process.env.MAINNET_RPC_URL,
        forking: {
            url: process.env.MAINNET_RPC_URL,

            blockNumber: 18500000,
        },
        chainId: 1,
        gas: 12000000,
        gasPrice: 20000000000,
        accounts: [
            "f38837fb22ddf0b632e3a7f013c2f90ed588ae408a0119fb896e5e1f9e3c9b1d",
        ],
    },
    // Alternative: local hardhat network with mainnet fork
    localhost: {
        url: "http://127.0.0.1:8545",
        chainId: 31337,
        forking: {
            url: process.env.MAINNET_RPC_URL,
            blockNumber: 18500000,
        },
    },
};

const mergedNetworks = {
    ...networks,
    ...mainnetForkConfig,
    hardhat: {
        forking: {
            url: process.env.MAINNET_RPC_URLk,
        },
        chainId: 31337,
        gas: 12000000,
        gasPrice: 20000000000,
    },
};

module.exports = {
    etherscan,
    tracer: {
        enableAllOpcodes: true,
    },
    solidity: {
        version: "0.8.23",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1_000_000,
            },
            evmVersion: networks[getNetwork()]?.hardfork || "shanghai",
            viaIR: true,
        },
    },
    networks: mergedNetworks,
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    gasReporter: {
        enable: true,
        currency: "USD",
    },
    dependencyCompiler: {
        paths: [
            "@1inch/solidity-utils/contracts/mocks/TokenCustomDecimalsMock.sol",
            "@1inch/solidity-utils/contracts/mocks/TokenMock.sol",
            "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol",
        ],
    },
    zksolc: {
        version: "1.4.0",
        compilerSource: "binary",
        settings: {},
    },
    docgen: {
        outputDir: "docs",
        templates: oneInchTemplates(),
        pages: "files",
        exclude: ["mocks"],
    },
};
