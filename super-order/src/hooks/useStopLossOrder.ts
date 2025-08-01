import { useAccount, useSignTypedData, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits, encodePacked, type Address, parseEther } from 'viem';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { 
  CONTRACT_ADDRESSES, 
  LIMIT_ORDER_PROTOCOL_ABI, 
  STOP_LOSS_V2_ABI,
  CHAIN_ID 
} from '@/lib/contracts/config';

// Helper to build extension data for AmountGetter
function buildStopLossExtensionData(stopLossAddress: Address, extraData = '0x') {
  return encodePacked(
    ['address', 'bytes'],
    [stopLossAddress, extraData as `0x${string}`]
  );
}

// Build maker traits (from orderUtils.js)
function buildMakerTraits() {
  // Default traits: allow partial fills, single fill
  return 0n;
}

export function useStopLossOrder() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  // Contract write hooks
  const { 
    writeContract: configureStopLoss, 
    data: configureHash,
    isPending: isConfigurePending,
    error: configureError
  } = useWriteContract();

  const { 
    isLoading: isConfigureLoading, 
    isSuccess: isConfigureSuccess 
  } = useWaitForTransactionReceipt({
    hash: configureHash,
  });

  // Create and configure stop loss order
  const createStopLossOrder = async ({
    tokenPair,
    amount,
    triggerPrice,
    isStopLoss,
    slippage,
    maxPriceDeviation
  }: {
    tokenPair: string;
    amount: string;
    triggerPrice: string;
    isStopLoss: boolean;
    slippage: string;
    maxPriceDeviation: string;
  }) => {
    if (!address || !publicClient) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      // Parse token pair
      const [sellToken, buyToken] = tokenPair.split("/");
      const makerAsset = CONTRACT_ADDRESSES[sellToken.toLowerCase() as keyof typeof CONTRACT_ADDRESSES] as Address;
      const takerAsset = CONTRACT_ADDRESSES[buyToken.toLowerCase() as keyof typeof CONTRACT_ADDRESSES] as Address;

      // Get decimals (hardcoded for now)
      const decimals = {
        WETH: 18,
        USDC: 6,
        DAI: 18
      };

      const makerDecimals = decimals[sellToken as keyof typeof decimals];
      const takerDecimals = decimals[buyToken as keyof typeof decimals];

      // Parse amounts
      const makingAmount = parseUnits(amount, makerDecimals);
      const takingAmount = parseUnits((parseFloat(amount) * parseFloat(triggerPrice)).toString(), takerDecimals);

      console.log("=== Stop Loss Order Creation Debug ===");
      console.log("Order Type:", isStopLoss ? "Stop Loss" : "Take Profit");
      console.log("Sell Token:", sellToken, "Address:", makerAsset);
      console.log("Buy Token:", buyToken, "Address:", takerAsset);
      console.log("Amount to Sell:", amount, sellToken);
      console.log("Trigger Price:", triggerPrice, `${buyToken} per ${sellToken}`);
      console.log("Making Amount (wei):", makingAmount.toString());
      console.log("Taking Amount (wei):", takingAmount.toString());
      console.log("Slippage:", slippage + "%");
      console.log("Max Price Deviation:", maxPriceDeviation + "%");

      // Build the order following the demo script structure
      const salt = BigInt(Date.now());
      const stopLossExtensionData = buildStopLossExtensionData(
        CONTRACT_ADDRESSES.stopLossV2 as Address
      );

      // Build order with extension data
      const order = {
        salt,
        maker: address,
        receiver: address,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        makerTraits: buildMakerTraits(),
      };

      // Build the full order structure with extension data
      const orderWithExtension = {
        ...order,
        makingAmountData: stopLossExtensionData,
        takingAmountData: stopLossExtensionData,
      };

      console.log("Order structure:", orderWithExtension);

      // Call hashOrder on the contract to get the proper order hash
      const orderHash = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.limitOrderProtocol as Address,
        abi: LIMIT_ORDER_PROTOCOL_ABI,
        functionName: 'hashOrder',
        args: [order],
      });

      console.log("Order Hash from contract:", orderHash);

      // Sign the order using EIP-712
      const domain = {
        name: '1inch Limit Order Protocol',
        version: '4',
        chainId: CHAIN_ID,
        verifyingContract: CONTRACT_ADDRESSES.limitOrderProtocol as Address,
      };

      const types = {
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'makerAsset', type: 'address' },
          { name: 'takerAsset', type: 'address' },
          { name: 'makingAmount', type: 'uint256' },
          { name: 'takingAmount', type: 'uint256' },
          { name: 'makerTraits', type: 'uint256' },
        ],
      };

      console.log("Signing order with EIP-712...");
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'Order',
        message: order,
      });

      console.log("Order signed successfully!");

      // Configure stop loss parameters
      toast.loading("Configuring stop loss parameters...", {
        id: "stop-loss-config",
      });

      // Use the correct oracle addresses based on the token pair
      const getOracleForToken = (token: string) => {
        // For WETH/ETH, use the ETH oracle
        if (token === 'WETH') return CONTRACT_ADDRESSES.ethOracle;
        // For USDC, use the USDC oracle
        if (token === 'USDC') return CONTRACT_ADDRESSES.usdcOracle;
        // For DAI, we'll use the ETH oracle as a placeholder (in real scenario, you'd have a DAI oracle)
        if (token === 'DAI') return CONTRACT_ADDRESSES.ethOracle;
        return CONTRACT_ADDRESSES.ethOracle;
      };

      const stopLossConfig = {
        makerAssetOracle: getOracleForToken(sellToken),
        takerAssetOracle: getOracleForToken(buyToken),
        stopPrice: parseEther(triggerPrice), // Price in 18 decimals
        maxSlippage: BigInt(Math.floor(parseFloat(slippage) * 100)), // Convert percentage to basis points
        maxPriceDeviation: BigInt(Math.floor(parseFloat(maxPriceDeviation) * 100)),
        isStopLoss,
        keeper: '0x0000000000000000000000000000000000000000' as Address, // Any keeper
        orderMaker: address,
        configuredAt: 0n,
        makerTokenDecimals: makerDecimals,
        takerTokenDecimals: takerDecimals,
      };

      console.log("Stop Loss Config:", stopLossConfig);
      console.log("Using oracles - Maker:", stopLossConfig.makerAssetOracle, "Taker:", stopLossConfig.takerAssetOracle);

      // Configure the stop loss
      await configureStopLoss({
        address: CONTRACT_ADDRESSES.stopLossV2 as Address,
        abi: STOP_LOSS_V2_ABI,
        functionName: 'configureStopLoss',
        args: [orderHash as `0x${string}`, address, stopLossConfig],
      });

      // Save order to database
      try {
        console.log("Saving order to database...");
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderHash,
            orderType: isStopLoss ? 'stop-loss' : 'take-profit',
            maker: address,
            makerAsset,
            takerAsset,
            makingAmount: makingAmount.toString(),
            takingAmount: takingAmount.toString(),
            salt: salt.toString(),
            signature,
            makerTraits: "0",
            makingAmountData: stopLossExtensionData,
            takingAmountData: stopLossExtensionData,
            triggerPrice,
            isStopLoss,
            maxSlippage: slippage,
            maxPriceDeviation,
            createTxHash: configureHash,
          }),
        });

        if (response.ok) {
          console.log("Order saved to database successfully!");
        } else {
          console.error("Failed to save order to database");
        }
      } catch (error) {
        console.error("Error saving order to database:", error);
      }

      // Store order details for later reference
      return {
        order: orderWithExtension,
        orderHash,
        signature,
        stopLossConfig,
      };

    } catch (error) {
      console.error("Stop loss order creation error:", error);
      toast.error("Failed to create stop loss order", {
        id: "stop-loss-config",
      });
      throw error;
    }
  };

  // Update toasts based on transaction status
  useEffect(() => {
    if (isConfigureSuccess) {
      toast.success("Stop loss order configured successfully!", {
        id: "stop-loss-config",
      });
    }
  }, [isConfigureSuccess]);

  useEffect(() => {
    if (configureError) {
      toast.error(`Failed to configure stop loss: ${configureError.message}`, {
        id: "stop-loss-config",
      });
    }
  }, [configureError]);

  return {
    createStopLossOrder,
    isLoading: isConfigurePending || isConfigureLoading,
    isSuccess: isConfigureSuccess,
  };
}