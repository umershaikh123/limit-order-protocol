// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IPreInteraction } from "../interfaces/IPreInteraction.sol";
import { ITakerInteraction } from "../interfaces/ITakerInteraction.sol";

/**
 * @title StopLossMarketOrderSecure
 * @notice Secure extension contract that enables stop loss market orders using Chainlink price feeds
 * @dev This contract monitors prices and executes market orders when stop loss conditions are met
 * @dev Security features: Access control, reentrancy protection, oracle validation, slippage protection
 */
contract StopLossMarketOrderSecure is IPreInteraction, ITakerInteraction, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using Math for uint256;

    error StopLossNotTriggered();
    error InvalidStopPrice();
    error InvalidOracle();
    error UnauthorizedKeeper();
    error UnauthorizedCaller();
    error StaleOraclePrice();
    error InvalidOraclePrice();
    error InsufficientSlippage();
    error OnlyLimitOrderProtocol();
    error InvalidSlippageTolerance();
    error OracleDecimalsMismatch();
    error PriceCalculationOverflow();
    error InvalidAggregationRouter();
    error SwapExecutionFailed();

    struct StopLossConfig {
        AggregatorV3Interface makerAssetOracle;  // Chainlink oracle for maker asset
        AggregatorV3Interface takerAssetOracle;  // Chainlink oracle for taker asset
        uint256 stopPrice;                       // Stop price threshold (scaled to 18 decimals)
        uint256 maxSlippage;                     // Maximum acceptable slippage (basis points, max 5000 = 50%)
        bool isStopLoss;                         // true for stop loss, false for take profit
        address keeper;                          // Authorized keeper address (0x0 for any)
        address orderMaker;                      // Order maker address for authorization
        uint256 configuredAt;                    // Timestamp when configured
    }

    uint256 private constant _PRICE_DECIMALS = 18;
    uint256 private constant _SLIPPAGE_DENOMINATOR = 10000;
    uint256 private constant _MAX_SLIPPAGE = 5000; // 50% maximum slippage
    uint256 private constant _ORACLE_TTL = 1 hours;
    uint256 private constant _MAX_ORACLE_DECIMALS = 18;

    // Mapping from order hash to stop loss configuration
    mapping(bytes32 => StopLossConfig) public stopLossConfigs;
    
    // Approved aggregation routers for security
    mapping(address => bool) public approvedRouters;

    address public immutable limitOrderProtocol;

    event StopLossConfigured(
        bytes32 indexed orderHash,
        address indexed orderMaker,
        address makerAssetOracle,
        address takerAssetOracle,
        uint256 stopPrice,
        bool isStopLoss
    );

    event StopLossTriggered(
        bytes32 indexed orderHash,
        address indexed keeper,
        uint256 executionPrice,
        uint256 returnAmount
    );

    event AggregationRouterApproved(address indexed router, bool approved);

    modifier onlyOrderMaker(bytes32 orderHash) {
        StopLossConfig memory config = stopLossConfigs[orderHash];
        if (config.orderMaker != msg.sender) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier validOracle(AggregatorV3Interface oracle) {
        if (address(oracle) == address(0)) {
            revert InvalidOracle();
        }
        if (oracle.decimals() > _MAX_ORACLE_DECIMALS) {
            revert InvalidOracle();
        }
        _;
    }

    constructor(address _limitOrderProtocol) Ownable(msg.sender) {
        if (_limitOrderProtocol == address(0)) {
            revert InvalidAggregationRouter();
        }
        limitOrderProtocol = _limitOrderProtocol;
    }

    /**
     * @notice Approve or revoke aggregation router for market execution
     * @param router The aggregation router address
     * @param approved Whether to approve or revoke
     */
    function setAggregationRouterApproval(address router, bool approved) external onlyOwner {
        if (router == address(0)) {
            revert InvalidAggregationRouter();
        }
        approvedRouters[router] = approved;
        emit AggregationRouterApproved(router, approved);
    }

    /**
     * @notice Configure stop loss parameters for an order (only order maker)
     * @param orderHash The hash of the limit order
     * @param orderMaker The address of the order maker
     * @param config The stop loss configuration
     */
    function configureStopLoss(
        bytes32 orderHash,
        address orderMaker,
        StopLossConfig calldata config
    ) external {
        // Only order maker can configure their own orders
        if (msg.sender != orderMaker) {
            revert UnauthorizedCaller();
        }
        
        // Validate configuration
        if (address(config.makerAssetOracle) == address(0) || 
            address(config.takerAssetOracle) == address(0)) {
            revert InvalidOracle();
        }
        if (config.stopPrice == 0) {
            revert InvalidStopPrice();
        }
        if (config.maxSlippage > _MAX_SLIPPAGE) {
            revert InvalidSlippageTolerance();
        }
        
        // Validate oracle decimals match for price calculation
        if (config.makerAssetOracle.decimals() != config.takerAssetOracle.decimals()) {
            revert OracleDecimalsMismatch();
        }
        
        // Store configuration with maker authorization
        StopLossConfig storage storedConfig = stopLossConfigs[orderHash];
        storedConfig.makerAssetOracle = config.makerAssetOracle;
        storedConfig.takerAssetOracle = config.takerAssetOracle;
        storedConfig.stopPrice = config.stopPrice;
        storedConfig.maxSlippage = config.maxSlippage;
        storedConfig.isStopLoss = config.isStopLoss;
        storedConfig.keeper = config.keeper;
        storedConfig.orderMaker = orderMaker;
        storedConfig.configuredAt = block.timestamp;
        
        emit StopLossConfigured(
            orderHash,
            orderMaker,
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
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address taker,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external view {
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        // Ensure stop loss is configured
        if (config.configuredAt == 0) {
            revert StopLossNotTriggered();
        }
        
        // Check if caller is authorized keeper
        if (config.keeper != address(0) && taker != config.keeper) {
            revert UnauthorizedKeeper();
        }
        
        // Get current price from Chainlink oracles with validation
        uint256 currentPrice = _getCurrentPriceSecure(
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
     * @notice Taker interaction to execute market order via approved aggregation router
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
    ) external nonReentrant {
        if (msg.sender != limitOrderProtocol) {
            revert OnlyLimitOrderProtocol();
        }
        
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        // Decode aggregation router and swap data from extraData
        (address aggregationRouter, bytes memory swapData) = abi.decode(extraData, (address, bytes));
        
        // Validate router is approved
        if (!approvedRouters[aggregationRouter]) {
            revert InvalidAggregationRouter();
        }
        
        // Get current price for slippage validation (before swap)
        uint256 preSwapPrice = _getCurrentPriceSecure(
            config.makerAssetOracle,
            config.takerAssetOracle
        );
        
        // Calculate minimum acceptable return based on current price and slippage
        uint256 minReturn = _calculateMinReturn(makingAmount, preSwapPrice, config.maxSlippage);
        
        // Transfer maker asset from maker to this contract
        IERC20(order.makerAsset.get()).safeTransferFrom(
            order.maker.get(),
            address(this),
            makingAmount
        );
        
        // Approve aggregation router to spend maker asset (exact amount)
        IERC20 makerToken = IERC20(order.makerAsset.get());
        makerToken.safeIncreaseAllowance(aggregationRouter, makingAmount);
        
        // Execute market order via approved aggregation router
        (bool success, bytes memory result) = aggregationRouter.call(swapData);
        if (!success) {
            revert SwapExecutionFailed();
        }
        
        // Decode return amount (assuming router returns uint256)
        uint256 returnAmount;
        if (result.length >= 32) {
            returnAmount = abi.decode(result, (uint256));
        } else {
            // Fallback: check actual balance received
            returnAmount = IERC20(order.takerAsset.get()).balanceOf(address(this));
        }
        
        // Validate slippage protection
        if (returnAmount < minReturn) {
            revert InsufficientSlippage();
        }
        
        // Reset allowance to zero for security
        makerToken.safeDecreaseAllowance(aggregationRouter, makerToken.allowance(address(this), aggregationRouter));
        
        // Transfer received tokens to taker
        IERC20(order.takerAsset.get()).safeTransfer(taker, returnAmount);
        
        emit StopLossTriggered(orderHash, taker, preSwapPrice, returnAmount);
    }

    /**
     * @notice Get current price from Chainlink oracles with comprehensive validation (external wrapper)
     * @dev Returns price scaled to 18 decimals with security checks
     */
    function _getCurrentPriceSecureExternal(
        AggregatorV3Interface makerAssetOracle,
        AggregatorV3Interface takerAssetOracle
    ) external view returns (uint256) {
        return _getCurrentPriceSecure(makerAssetOracle, takerAssetOracle);
    }

    /**
     * @notice Get current price from Chainlink oracles with comprehensive validation
     * @dev Returns price scaled to 18 decimals with security checks
     */
    function _getCurrentPriceSecure(
        AggregatorV3Interface makerAssetOracle,
        AggregatorV3Interface takerAssetOracle
    ) internal view returns (uint256) {
        // Get maker asset price with validation
        (, int256 makerPrice,, uint256 makerUpdatedAt,) = makerAssetOracle.latestRoundData();
        if (makerPrice <= 0) {
            revert InvalidOraclePrice();
        }
        if (makerUpdatedAt + _ORACLE_TTL < block.timestamp) {
            revert StaleOraclePrice();
        }
        
        // Get taker asset price with validation
        (, int256 takerPrice,, uint256 takerUpdatedAt,) = takerAssetOracle.latestRoundData();
        if (takerPrice <= 0) {
            revert InvalidOraclePrice();
        }
        if (takerUpdatedAt + _ORACLE_TTL < block.timestamp) {
            revert StaleOraclePrice();
        }
        
        // Get oracle decimals (already validated to match)
        uint256 oracleDecimals = makerAssetOracle.decimals();
        
        // Calculate relative price (maker/taker) with overflow protection
        // Price = (makerPrice * 10^18) / takerPrice
        uint256 price = Math.mulDiv(
            uint256(makerPrice),
            10**_PRICE_DECIMALS,
            uint256(takerPrice)
        );
        
        return price;
    }

    /**
     * @notice Calculate minimum return amount considering slippage
     */
    function _calculateMinReturn(
        uint256 makingAmount,
        uint256 currentPrice,
        uint256 maxSlippage
    ) internal pure returns (uint256) {
        // Expected return at current price
        uint256 expectedReturn = makingAmount.mulDiv(currentPrice, 10**_PRICE_DECIMALS);
        
        // Apply slippage tolerance
        uint256 minReturn = expectedReturn.mulDiv(
            _SLIPPAGE_DENOMINATOR - maxSlippage,
            _SLIPPAGE_DENOMINATOR
        );
        
        return minReturn;
    }

    /**
     * @notice Check if stop loss is triggered for an order
     * @param orderHash The hash of the order to check
     * @return triggered Whether the stop loss condition is met
     * @return currentPrice The current price from oracles
     */
    function isStopLossTriggered(bytes32 orderHash) external view returns (bool triggered, uint256 currentPrice) {
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        if (address(config.makerAssetOracle) == address(0) || config.configuredAt == 0) {
            return (false, 0);
        }
        
        try this._getCurrentPriceSecureExternal(config.makerAssetOracle, config.takerAssetOracle) returns (uint256 price) {
            currentPrice = price;
            
            if (config.isStopLoss) {
                triggered = currentPrice < config.stopPrice;
            } else {
                triggered = currentPrice > config.stopPrice;
            }
        } catch {
            return (false, 0);
        }
    }

    /**
     * @notice Remove stop loss configuration (only order maker or owner)
     * @param orderHash The order hash to remove configuration for
     */
    function removeStopLossConfig(bytes32 orderHash) external {
        StopLossConfig memory config = stopLossConfigs[orderHash];
        
        // Only order maker or contract owner can remove
        if (msg.sender != config.orderMaker && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        
        delete stopLossConfigs[orderHash];
    }

    /**
     * @notice Emergency function to recover stuck tokens (only owner)
     */
    function emergencyRecoverToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}