// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IPreInteraction } from "../interfaces/IPreInteraction.sol";
import { ITakerInteraction } from "../interfaces/ITakerInteraction.sol";

/**
 * @title StopLossMarketOrder
 * @notice Extension contract that enables stop loss market orders using Chainlink price feeds
 * @dev This contract monitors prices and executes market orders when stop loss conditions are met
 */
contract StopLossMarketOrder is IPreInteraction, ITakerInteraction, Ownable {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    error StopLossNotTriggered();
    error InvalidStopPrice();
    error InvalidOracle();
    error UnauthorizedKeeper();
    error StaleOraclePrice();
    error InsufficientSlippage();
    error OnlyLimitOrderProtocol();

    struct StopLossConfig {
        AggregatorV3Interface makerAssetOracle;  // Chainlink oracle for maker asset
        AggregatorV3Interface takerAssetOracle;  // Chainlink oracle for taker asset
        uint256 stopPrice;                       // Stop price threshold (scaled to 18 decimals)
        uint256 maxSlippage;                     // Maximum acceptable slippage (basis points, e.g., 100 = 1%)
        bool isStopLoss;                         // true for stop loss, false for take profit
        address keeper;                          // Authorized keeper address (0x0 for any)
    }

    uint256 private constant _PRICE_DECIMALS = 18;
    uint256 private constant _SLIPPAGE_DENOMINATOR = 10000;
    uint256 private constant _ORACLE_TTL = 1 hours;

    // Mapping from order hash to stop loss configuration
    mapping(bytes32 => StopLossConfig) public stopLossConfigs;

    address public immutable aggregationRouter;
    address public immutable limitOrderProtocol;

    event StopLossConfigured(
        bytes32 indexed orderHash,
        address makerAssetOracle,
        address takerAssetOracle,
        uint256 stopPrice,
        bool isStopLoss
    );

    event StopLossTriggered(
        bytes32 indexed orderHash,
        uint256 executionPrice,
        uint256 returnAmount
    );

    constructor(address _aggregationRouter, address _limitOrderProtocol) Ownable(msg.sender) {
        require(_aggregationRouter != address(0) && _limitOrderProtocol != address(0), "Invalid address");
        aggregationRouter = _aggregationRouter;
        limitOrderProtocol = _limitOrderProtocol;
    }

    /**
     * @notice Configure stop loss parameters for an order
     * @param orderHash The hash of the limit order
     * @param config The stop loss configuration
     */
    function configureStopLoss(
        bytes32 orderHash,
        StopLossConfig calldata config
    ) external {
        if (address(config.makerAssetOracle) == address(0) || 
            address(config.takerAssetOracle) == address(0)) {
            revert InvalidOracle();
        }
        if (config.stopPrice == 0) {
            revert InvalidStopPrice();
        }
        
        stopLossConfigs[orderHash] = config;
        
        emit StopLossConfigured(
            orderHash,
            address(config.makerAssetOracle),
            address(config.takerAssetOracle),
            config.stopPrice,
            config.isStopLoss
        );
    }

    /**
     * @notice Pre-interaction hook to validate stop loss conditions
     * @dev Called before order execution to ensure stop loss is triggered
     */
    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address taker,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external view {
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        // Check if caller is authorized keeper
        if (config.keeper != address(0) && taker != config.keeper) {
            revert UnauthorizedKeeper();
        }
        
        // Get current price from Chainlink oracles
        uint256 currentPrice = _getCurrentPrice(
            config.makerAssetOracle,
            config.takerAssetOracle
        );
        
        // Check stop loss condition
        if (config.isStopLoss) {
            // For stop loss: trigger when price falls below stopPrice
            if (currentPrice >= config.stopPrice) {
                revert StopLossNotTriggered();
            }
        } else {
            // For take profit: trigger when price rises above stopPrice
            if (currentPrice <= config.stopPrice) {
                revert StopLossNotTriggered();
            }
        }
    }

    /**
     * @notice Taker interaction to execute market order via 1inch Aggregation Router
     * @dev This is called during order fill to execute the market swap
     */
    function takerInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        if (msg.sender != limitOrderProtocol) {
            revert OnlyLimitOrderProtocol();
        }
        
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        // Decode aggregation router swap data from extraData
        (bytes memory swapData) = abi.decode(extraData, (bytes));
        
        // Transfer maker asset from maker to this contract
        IERC20(order.makerAsset.get()).safeTransferFrom(
            order.maker.get(),
            address(this),
            makingAmount
        );
        
        // Approve aggregation router to spend maker asset
        IERC20 makerToken = IERC20(order.makerAsset.get());
        makerToken.safeIncreaseAllowance(aggregationRouter, makingAmount);
        
        // Execute market order via 1inch Aggregation Router
        (bool success, bytes memory result) = aggregationRouter.call{value: 0}(swapData);
        require(success, "Aggregation router call failed");
        
        uint256 returnAmount = abi.decode(result, (uint256));
        
        // Validate slippage
        uint256 minReturn = takingAmount * (_SLIPPAGE_DENOMINATOR - config.maxSlippage) / _SLIPPAGE_DENOMINATOR;
        if (returnAmount < minReturn) {
            revert InsufficientSlippage();
        }
        
        // Transfer received tokens to taker
        IERC20(order.takerAsset.get()).safeTransfer(taker, returnAmount);
        
        emit StopLossTriggered(orderHash, _getCurrentPrice(config.makerAssetOracle, config.takerAssetOracle), returnAmount);
    }

    /**
     * @notice Get current price from Chainlink oracles
     * @dev Returns price scaled to 18 decimals
     */
    function _getCurrentPrice(
        AggregatorV3Interface makerAssetOracle,
        AggregatorV3Interface takerAssetOracle
    ) internal view returns (uint256) {
        // Get maker asset price
        (, int256 makerPrice,, uint256 makerUpdatedAt,) = makerAssetOracle.latestRoundData();
        if (makerUpdatedAt + _ORACLE_TTL < block.timestamp) {
            revert StaleOraclePrice();
        }
        
        // Get taker asset price
        (, int256 takerPrice,, uint256 takerUpdatedAt,) = takerAssetOracle.latestRoundData();
        if (takerUpdatedAt + _ORACLE_TTL < block.timestamp) {
            revert StaleOraclePrice();
        }
        
        // Calculate relative price (maker/taker) scaled to 18 decimals
        uint256 makerDecimals = makerAssetOracle.decimals();
        uint256 takerDecimals = takerAssetOracle.decimals();
        
        uint256 price = uint256(makerPrice) * 10**_PRICE_DECIMALS * 10**takerDecimals / 
                       (uint256(takerPrice) * 10**makerDecimals);
        
        return price;
    }

    /**
     * @notice Check if stop loss is triggered for an order
     * @param orderHash The hash of the order to check
     * @return triggered Whether the stop loss condition is met
     * @return currentPrice The current price from oracles
     */
    function isStopLossTriggered(bytes32 orderHash) external view returns (bool triggered, uint256 currentPrice) {
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        if (address(config.makerAssetOracle) == address(0)) {
            return (false, 0);
        }
        
        currentPrice = _getCurrentPrice(config.makerAssetOracle, config.takerAssetOracle);
        
        if (config.isStopLoss) {
            triggered = currentPrice < config.stopPrice;
        } else {
            triggered = currentPrice > config.stopPrice;
        }
    }

    /**
     * @notice Remove stop loss configuration
     * @param orderHash The order hash to remove configuration for
     */
    function removeStopLossConfig(bytes32 orderHash) external onlyOwner {
        delete stopLossConfigs[orderHash];
    }
}