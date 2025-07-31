// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

/**
 * @title IAggregationRouterV6
 * @notice Interface for 1inch Aggregation Router V6 (simplified)
 */
interface IAggregationRouterV6 {
    function swap(
        address executor,
        bytes calldata desc,
        bytes calldata data
    ) external payable returns (uint256 returnAmount);
}