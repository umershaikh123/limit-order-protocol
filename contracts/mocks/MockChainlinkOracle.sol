// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/// @title Mock Chainlink Oracle for testing
contract MockChainlinkOracle is AggregatorV3Interface {
    uint8 public immutable override decimals;
    string public override description;
    uint256 public override version = 1;

    int256 private _latestAnswer;
    uint256 private _latestTimestamp;
    uint80 private _latestRound;

    constructor(uint8 _decimals, string memory _description) {
        decimals = _decimals;
        description = _description;
        _latestTimestamp = block.timestamp;
        _latestRound = 1;
    }

    function updateAnswer(int256 _answer) external {
        _latestAnswer = _answer;
        _latestTimestamp = block.timestamp;
        _latestRound++;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _latestAnswer, _latestTimestamp, _latestTimestamp, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_latestRound, _latestAnswer, _latestTimestamp, _latestTimestamp, _latestRound);
    }
}