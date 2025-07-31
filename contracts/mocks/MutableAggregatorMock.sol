// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

/// @title Mutable mock oracle for testing price changes
contract MutableAggregatorMock is AggregatorV2V3Interface {
    error NoDataPresent();

    int256 private _answer;
    uint256 private _updatedAt;

    constructor(int256 answer) {
        _answer = answer;
        _updatedAt = block.timestamp;
    }

    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function description() external pure returns (string memory) {
        return "MutableAggregatorMock";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        if (_roundId != 0) revert NoDataPresent();
        return latestRoundData();
    }

    function latestRoundData()
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, _answer, _updatedAt, _updatedAt, 0);
    }

    function latestAnswer() public view returns (int256) {
        return _answer;
    }

    function latestTimestamp() public view returns (uint256) {
        return _updatedAt;
    }

    function latestRound() external pure returns (uint256) {
        return 0;
    }

    function getAnswer(uint256 roundId) external view returns (int256) {
        if (roundId != 0) revert NoDataPresent();
        return latestAnswer();
    }

    function getTimestamp(uint256 roundId) external view returns (uint256) {
        if (roundId != 0) revert NoDataPresent();
        return latestTimestamp();
    }
}