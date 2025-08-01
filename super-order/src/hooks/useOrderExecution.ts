import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, parseEther, type Address } from 'viem';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { 
  CONTRACT_ADDRESSES, 
  LIMIT_ORDER_PROTOCOL_ABI, 
  ERC20_ABI 
} from '@/lib/contracts/config';

// Helper function to build taker traits (from orderUtils.js)
function buildTakerTraits({
  makingAmount = false,
  unwrapWeth = false,
  skipMakerPermit = false,
  usePermit2 = false,
  target = '0x',
  extension = '0x',
  interaction = '0x',
  threshold = 0n,
} = {}) {
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

  const trimHex = (hex: string) => hex.replace(/^0x/, '');

  return {
    traits: BigInt(threshold) | (
      (makingAmount ? TakerTraitsConstants._MAKER_AMOUNT_FLAG : 0n) |
      (unwrapWeth ? TakerTraitsConstants._UNWRAP_WETH_FLAG : 0n) |
      (skipMakerPermit ? TakerTraitsConstants._SKIP_ORDER_PERMIT_FLAG : 0n) |
      (usePermit2 ? TakerTraitsConstants._USE_PERMIT2_FLAG : 0n) |
      (trimHex(target).length > 0 ? TakerTraitsConstants._ARGS_HAS_TARGET : 0n) |
      (BigInt(trimHex(extension).length / 2) << TakerTraitsConstants._ARGS_EXTENSION_LENGTH_OFFSET) |
      (BigInt(trimHex(interaction).length / 2) << TakerTraitsConstants._ARGS_INTERACTION_LENGTH_OFFSET)
    ),
    args: `0x${trimHex(target)}${trimHex(extension)}${trimHex(interaction)}` as `0x${string}`,
  };
}

// Helper to convert signature to r, vs format
function signatureToRVS(signature: string) {
  const sig = signature.slice(2); // Remove 0x
  const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
  const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(sig.slice(128, 130), 16);
  
  // Convert to vs format (compact signature)
  const vs = BigInt(s) | (BigInt(v - 27) << 255n);
  const vsHex = `0x${vs.toString(16).padStart(64, '0')}` as `0x${string}`;
  
  return { r, vs: vsHex };
}

interface OrderData {
  id: string;
  orderHash: string;
  orderType: string;
  maker: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  salt: string;
  signature: string;
  makerTraits?: string;
  makingAmountData?: string;
  takingAmountData?: string;
  triggerPrice: string | null;
  isStopLoss: boolean | null;
}

export function useOrderExecution() {
  const { address } = useAccount();

  // Contract write hooks for execution
  const { 
    writeContract: executeOrder, 
    data: executeHash,
    isPending: isExecutePending,
    error: executeError
  } = useWriteContract();

  const { 
    isLoading: isExecuteLoading, 
    isSuccess: isExecuteSuccess 
  } = useWaitForTransactionReceipt({
    hash: executeHash,
  });

  // Read balances for display
  const useTokenBalance = (tokenAddress: Address, account: Address | undefined) => {
    return useReadContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: account ? [account] : undefined,
      query: { enabled: !!account },
    });
  };

  // Execute an order
  const executeOrderFunction = async (orderData: OrderData, amountToFill?: string) => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      console.log("=== Order Execution Debug ===");
      console.log("Order Data:", orderData);
      console.log("Executor Address:", address);
      console.log("Amount to Fill:", amountToFill || "Full Amount");

      // Get token decimals
      const decimals = {
        [CONTRACT_ADDRESSES.weth]: 18,
        [CONTRACT_ADDRESSES.usdc]: 6,
        [CONTRACT_ADDRESSES.dai]: 18,
      };

      const makerDecimals = decimals[orderData.makerAsset as keyof typeof decimals] || 18;
      const takerDecimals = decimals[orderData.takerAsset as keyof typeof decimals] || 18;

      // Calculate fill amount (default to full order)
      const fillAmount = amountToFill 
        ? parseUnits(amountToFill, makerDecimals)
        : BigInt(orderData.makingAmount);

      console.log("Fill Amount (wei):", fillAmount.toString());

      // Get balances before execution
      const makerBalanceBefore = await fetch(`/api/balance?token=${orderData.makerAsset}&account=${orderData.maker}`);
      const takerBalanceBefore = await fetch(`/api/balance?token=${orderData.takerAsset}&account=${address}`);

      console.log("Balances fetched, preparing order execution...");

      // Reconstruct the order object with the exact structure used during creation
      // For stop loss orders, we need to include the extension data in the order structure
      const order = {
        salt: BigInt(orderData.salt),
        maker: orderData.maker as Address,
        receiver: orderData.maker as Address, // Receiver is usually the maker
        makerAsset: orderData.makerAsset as Address,
        takerAsset: orderData.takerAsset as Address,
        makingAmount: BigInt(orderData.makingAmount),
        takingAmount: BigInt(orderData.takingAmount),
        makerTraits: BigInt(orderData.makerTraits || "0"),
        // Include extension data in the order structure
        ...(orderData.makingAmountData && { makingAmountData: orderData.makingAmountData as `0x${string}` }),
        ...(orderData.takingAmountData && { takingAmountData: orderData.takingAmountData as `0x${string}` }),
      };

      console.log("Order structure:", order);
      console.log("Extension data - makingAmountData:", orderData.makingAmountData);
      console.log("Extension data - takingAmountData:", orderData.takingAmountData);

      // Convert signature to r, vs format
      const { r, vs } = signatureToRVS(orderData.signature);
      console.log("Signature split - r:", r, "vs:", vs);

      // Build taker traits - for stop loss orders, NO extension needed in taker traits
      // The extension is already in the order's makingAmountData/takingAmountData
      const takerTraits = buildTakerTraits({
        // Empty - no extension data needed for execution
      });

      console.log("Taker Traits:", takerTraits);

      toast.loading("Executing order...", {
        id: "execute-order",
      });

      // Execute the order using fillOrderArgs
      await executeOrder({
        address: CONTRACT_ADDRESSES.limitOrderProtocol as Address,
        abi: LIMIT_ORDER_PROTOCOL_ABI,
        functionName: 'fillOrderArgs',
        args: [
          order,
          r,
          vs,
          fillAmount,
          takerTraits.traits,
          takerTraits.args,
        ],
      });

      console.log("Order execution transaction submitted!");

    } catch (error: any) {
      console.error("=== Order Execution Error Details ===");
      console.error("Error object:", error);
      console.error("Error message:", error?.message);
      console.error("Error cause:", error?.cause);
      console.error("Error details:", error?.details);
      console.error("Error data:", error?.data);
      console.error("Error stack:", error?.stack);
      
      // Log the order and parameters that failed
      console.error("Failed order data:", orderData);
      console.error("Fill amount:", fillAmount?.toString());
      console.error("Order structure:", order);
      console.error("Signature components:", { r, vs });
      console.error("Taker traits:", takerTraits);
      
      toast.error(`Failed to execute order: ${error?.message || 'Unknown error'}`, {
        id: "execute-order",
      });
      throw error;
    }
  };

  // Update order status in database after successful execution
  const updateOrderStatus = async (orderHash: string, status: string, txHash?: string) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderHash,
          status,
          fillTxHash: txHash,
          filledAmount: status === 'filled' ? '100' : undefined, // For now, assume full fill
        }),
      });

      if (response.ok) {
        console.log("Order status updated in database");
      } else {
        console.error("Failed to update order status");
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  // Handle successful execution
  useEffect(() => {
    if (isExecuteSuccess && executeHash) {
      toast.success("Order executed successfully!", {
        id: "execute-order",
      });
      
      // Update order status (orderHash would need to be passed here)
      // For now, we'll handle this in the component
      console.log("Execution successful! Tx hash:", executeHash);
    }
  }, [isExecuteSuccess, executeHash]);

  // Handle execution error
  useEffect(() => {
    if (executeError) {
      toast.error(`Execution failed: ${executeError.message}`, {
        id: "execute-order",
      });
    }
  }, [executeError]);

  return {
    executeOrder: executeOrderFunction,
    updateOrderStatus,
    isLoading: isExecutePending || isExecuteLoading,
    isSuccess: isExecuteSuccess,
    txHash: executeHash,
    error: executeError,
    useTokenBalance,
  };
}