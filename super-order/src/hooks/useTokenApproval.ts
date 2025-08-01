import {
    useAccount,
    useReadContract,
    useWriteContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "sonner";
import { ERC20_ABI, CONTRACT_ADDRESSES } from "@/lib/contracts/config";
import React from "react";

export function useTokenApproval(tokenSymbol: "WETH" | "USDC" | "DAI") {
    const { address } = useAccount();

    const tokenAddress =
        CONTRACT_ADDRESSES[
            tokenSymbol.toLowerCase() as keyof typeof CONTRACT_ADDRESSES
        ];
    const spenderAddress = CONTRACT_ADDRESSES.limitOrderProtocol;

    // Read current allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, spenderAddress as `0x${string}`] : undefined,
        query: {
            enabled: !!address,
        },
    });

    // Get token decimals
    const { data: decimals } = useReadContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
    });

    // Write contract for approval
    const {
        writeContract: approve,
        data: approveHash,
        isPending: isApprovePending,
        error: approveError,
    } = useWriteContract();

    // Wait for transaction receipt
    const { isLoading: isApproveLoading, isSuccess: isApproveSuccess } =
        useWaitForTransactionReceipt({
            hash: approveHash,
        });

    // Handle approval
    const handleApprove = async (amount: string) => {
        if (!address || !decimals) return;

        try {
            const parsedAmount = parseUnits(amount, decimals);

            console.log("=== Token Approval Debug ===");
            console.log("Token Symbol:", tokenSymbol);
            console.log("Token Address:", tokenAddress);
            console.log("Spender (Protocol):", spenderAddress);
            console.log("Amount to Approve:", amount, tokenSymbol);
            console.log("Parsed Amount (wei):", parsedAmount.toString());
            console.log("Current Allowance:", allowance ? formatUnits(allowance, decimals) : "0", tokenSymbol);

            toast.loading(`Approving ${amount} ${tokenSymbol}...`, {
                id: "approve-" + tokenSymbol,
            });

            approve({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [spenderAddress as `0x${string}`, parsedAmount],
            });
        } catch (error) {
            console.error("Approval error:", error);
            toast.error(`Failed to approve ${tokenSymbol}`, {
                id: "approve-" + tokenSymbol,
            });
        }
    };

    // Check if amount is approved
    const isApproved = (amount: string): boolean => {
        if (!allowance || !decimals) return false;
        const parsedAmount = parseUnits(amount, decimals);
        return allowance >= parsedAmount;
    };

    // Update toast on success
    React.useEffect(() => {
        if (isApproveSuccess) {
            toast.success(`${tokenSymbol} approved successfully!`, {
                id: "approve-" + tokenSymbol,
            });
            refetchAllowance();
        }
    }, [isApproveSuccess, tokenSymbol, refetchAllowance]);

    // Update toast on error
    React.useEffect(() => {
        if (approveError) {
            toast.error(
                `Failed to approve ${tokenSymbol}: ${approveError.message}`,
                {
                    id: "approve-" + tokenSymbol,
                }
            );
        }
    }, [approveError, tokenSymbol]);

    return {
        allowance: allowance ? formatUnits(allowance, decimals || 18) : "0",
        isApproved,
        handleApprove,
        isLoading: isApprovePending || isApproveLoading,
        isSuccess: isApproveSuccess,
        refetchAllowance,
    };
}
