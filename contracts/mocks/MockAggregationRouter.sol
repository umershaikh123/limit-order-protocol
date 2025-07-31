// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockAggregationRouter
 * @notice Mock implementation of 1inch Aggregation Router for testing
 */
contract MockAggregationRouter {
    using SafeERC20 for IERC20;

    mapping(address => mapping(address => uint256)) public mockSwapRates;

    event Swapped(
        address indexed fromToken,
        address indexed toToken,
        uint256 fromAmount,
        uint256 toAmount
    );

    /**
     * @notice Set mock swap rate for testing
     * @param fromToken Source token
     * @param toToken Destination token  
     * @param rate Amount of toToken per 1 unit of fromToken (scaled by token decimals)
     */
    function setMockSwapRate(address fromToken, address toToken, uint256 rate) external {
        mockSwapRates[fromToken][toToken] = rate;
    }

    /**
     * @notice Mock swap function that simulates 1inch aggregation router
     * @param executor The address executing the swap
     * @param desc Swap description (encoded)
     * @param data Additional swap data
     * @return returnAmount Amount of destination token received
     */
    function swap(
        address executor,
        bytes calldata desc,
        bytes calldata data
    ) external payable returns (uint256 returnAmount) {
        // Decode swap parameters from desc
        (address fromToken, address toToken, uint256 fromAmount) = abi.decode(
            desc,
            (address, address, uint256)
        );

        // Get mock swap rate
        uint256 rate = mockSwapRates[fromToken][toToken];
        require(rate > 0, "Mock rate not set");

        // Calculate return amount
        returnAmount = (fromAmount * rate) / 1e18;

        // Simulate token transfer
        IERC20(fromToken).safeTransferFrom(msg.sender, address(this), fromAmount);
        
        // For testing, we'll mint the return tokens
        // In real implementation, the router would have liquidity
        // Here we'll just transfer if we have balance
        uint256 balance = IERC20(toToken).balanceOf(address(this));
        if (balance >= returnAmount) {
            IERC20(toToken).safeTransfer(executor, returnAmount);
        } else {
            // For testing, transfer what we have
            if (balance > 0) {
                IERC20(toToken).safeTransfer(executor, balance);
                returnAmount = balance;
            }
        }

        emit Swapped(fromToken, toToken, fromAmount, returnAmount);
    }

    /**
     * @notice Allow receiving ETH
     */
    receive() external payable {}

    /**
     * @notice Deposit tokens for testing liquidity
     */
    function depositTestLiquidity(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
}