// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAmountGetter } from "../interfaces/IAmountGetter.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IPreInteraction } from "../interfaces/IPreInteraction.sol";
import { ITakerInteraction } from "../interfaces/ITakerInteraction.sol";
import { AmountGetterBase } from "./AmountGetterBase.sol";

/**
 * @title IcebergOrderV1
 * @notice Production-ready iceberg orders for the 1inch Limit Order Protocol
 * @dev Implements IAmountGetter for progressive order revelation with stealth execution
 * @dev Large orders are split into smaller chunks that are revealed progressively as previous chunks are filled
 */
contract IcebergOrderV1 is AmountGetterBase, IPreInteraction, ITakerInteraction, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using Math for uint256;
    using SafeCast for uint256;

    error IcebergNotConfigured();
    error InvalidChunkSize();
    error InvalidTotalAmount();
    error UnauthorizedCaller();
    error IcebergOrderCompleted();
    error ChunkNotReady();
    error InvalidRevealStrategy();
    error OnlyLimitOrderProtocol();
    error InsufficientRemainingAmount();
    error ChunkTooSmall();
    error ChunkTooLarge();
    error InvalidTimeInterval();
    error PriceImprovementRequired();

    enum RevealStrategy {
        FIXED_SIZE,      // Fixed chunk sizes
        PERCENTAGE,      // Percentage of remaining amount
        ADAPTIVE,        // Adjust based on fill rate and market conditions
        TIME_BASED       // Increase chunk size over time
    }

    struct IcebergConfig {
        uint256 totalMakingAmount;       // Total order size
        uint256 totalTakingAmount;       // Total expected to receive
        uint256 currentVisibleAmount;    // Currently visible chunk size
        uint256 filledAmount;            // Amount filled so far
        uint256 baseChunkSize;           // Base chunk size for calculations
        RevealStrategy strategy;         // How to calculate next chunk sizes
        uint256 maxVisiblePercent;       // Maximum percentage visible at once (basis points)
        uint256 revealInterval;          // Minimum time between chunk reveals (seconds)
        uint256 lastRevealTime;          // Timestamp of last chunk reveal
        uint256 lastFillTime;            // Timestamp of last fill
        uint256 minPriceImprovement;     // Required price improvement to reveal (basis points)
        uint256 lastPrice;               // Last fill price for improvement calculation
        address orderMaker;              // Order creator
        bool isActive;                   // Whether iceberg is still active
        uint256 configuredAt;            // Configuration timestamp
        uint8 makerTokenDecimals;        // Maker token decimals
        uint8 takerTokenDecimals;        // Taker token decimals
    }

    struct ChunkStats {
        uint256 totalChunks;             // Total chunks created
        uint256 averageFillTime;         // Average time to fill a chunk
        uint256 totalFillTime;           // Total time spent filling
        uint256 fastFills;               // Number of chunks filled quickly
        uint256 slowFills;               // Number of chunks filled slowly
    }

    // Constants following 1inch patterns
    uint256 private constant _BASIS_POINTS_DENOMINATOR = 10000;
    uint256 private constant _MAX_VISIBLE_PERCENT = 1000; // 10% maximum visible
    uint256 private constant _MIN_VISIBLE_PERCENT = 10;   // 0.1% minimum visible
    uint256 private constant _MIN_REVEAL_INTERVAL = 60;   // 1 minute minimum
    uint256 private constant _MAX_REVEAL_INTERVAL = 3600; // 1 hour maximum
    uint256 private constant _FAST_FILL_THRESHOLD = 300;  // 5 minutes considered fast
    uint256 private constant _SLOW_FILL_THRESHOLD = 1800; // 30 minutes considered slow
    uint256 private constant _ADAPTIVE_MULTIPLIER_BASE = 100; // 1.0x base multiplier
    uint256 private constant _PRICE_IMPROVEMENT_DENOMINATOR = 10000;

    // Storage
    mapping(bytes32 => IcebergConfig) public icebergConfigs;
    mapping(bytes32 => ChunkStats) public chunkStats;
    mapping(address => bool) public authorizedKeepers;
    mapping(bytes32 => uint256) public chunkNonces; // Prevent replay attacks

    address public immutable limitOrderProtocol;

    event IcebergConfigured(
        bytes32 indexed orderHash,
        address indexed orderMaker,
        uint256 totalMakingAmount,
        uint256 baseChunkSize,
        RevealStrategy strategy
    );

    event ChunkRevealed(
        bytes32 indexed orderHash,
        uint256 chunkId,
        uint256 chunkSize,
        uint256 totalFilled,
        uint256 remainingAmount
    );

    event ChunkFilled(
        bytes32 indexed orderHash,
        uint256 chunkId,
        uint256 filledAmount,
        uint256 fillPrice,
        uint256 fillTime
    );

    event IcebergCompleted(
        bytes32 indexed orderHash,
        uint256 totalFilled,
        uint256 totalChunks,
        uint256 avgFillTime
    );

    event KeeperAuthorized(address indexed keeper, bool authorized);

    modifier onlyOrderMaker(bytes32 orderHash) {
        IcebergConfig memory config = icebergConfigs[orderHash];
        if (config.orderMaker != msg.sender) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier onlyAuthorizedKeeper() {
        if (!authorizedKeepers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier validIceberg(bytes32 orderHash) {
        IcebergConfig memory config = icebergConfigs[orderHash];
        if (config.configuredAt == 0) {
            revert IcebergNotConfigured();
        }
        if (!config.isActive) {
            revert IcebergOrderCompleted();
        }
        _;
    }

    constructor(address _limitOrderProtocol) Ownable(msg.sender) {
        if (_limitOrderProtocol == address(0)) {
            revert OnlyLimitOrderProtocol();
        }
        limitOrderProtocol = _limitOrderProtocol;
    }

    /**
     * @notice Authorize or revoke keeper permissions
     * @param keeper The keeper address
     * @param authorized Whether to authorize the keeper
     */
    function setKeeperAuthorization(address keeper, bool authorized) external onlyOwner {
        authorizedKeepers[keeper] = authorized;
        emit KeeperAuthorized(keeper, authorized);
    }

    /**
     * @notice Configure iceberg parameters for an order (only order maker)
     * @param orderHash The hash of the limit order
     * @param orderMaker The address of the order maker
     * @param config The iceberg configuration
     */
    function configureIceberg(
        bytes32 orderHash,
        address orderMaker,
        IcebergConfig calldata config
    ) external {
        // Only order maker can configure their own orders
        if (msg.sender != orderMaker) {
            revert UnauthorizedCaller();
        }
        
        // Validate configuration
        _validateIcebergConfig(config);
        
        // Store configuration with maker authorization
        IcebergConfig storage storedConfig = icebergConfigs[orderHash];
        storedConfig.totalMakingAmount = config.totalMakingAmount;
        storedConfig.totalTakingAmount = config.totalTakingAmount;
        storedConfig.baseChunkSize = config.baseChunkSize;
        storedConfig.strategy = config.strategy;
        storedConfig.maxVisiblePercent = config.maxVisiblePercent;
        storedConfig.revealInterval = config.revealInterval;
        storedConfig.minPriceImprovement = config.minPriceImprovement;
        storedConfig.orderMaker = orderMaker;
        storedConfig.isActive = true;
        storedConfig.configuredAt = block.timestamp;
        storedConfig.lastRevealTime = block.timestamp;
        storedConfig.makerTokenDecimals = config.makerTokenDecimals;
        storedConfig.takerTokenDecimals = config.takerTokenDecimals;
        
        // Set initial visible amount
        storedConfig.currentVisibleAmount = _calculateInitialChunkSize(config);
        
        emit IcebergConfigured(
            orderHash,
            orderMaker,
            config.totalMakingAmount,
            config.baseChunkSize,
            config.strategy
        );
    }

    /**
     * @notice Get making amount using iceberg logic (IAmountGetter implementation)
     * @dev This integrates with 1inch protocol's dynamic pricing system
     */
    function _getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        // If no iceberg configured, use base implementation
        if (config.configuredAt == 0) {
            return super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData);
        }

        // If iceberg completed, return 0
        if (!config.isActive || config.filledAmount >= config.totalMakingAmount) {
            return 0;
        }

        // Calculate current chunk's maximum available amount
        uint256 currentChunkMax = _getCurrentChunkMaxAmount(config);
        
        // Return minimum of remaining order amount and current chunk limit
        return Math.min(remainingMakingAmount, currentChunkMax);
    }

    /**
     * @notice Get taking amount using iceberg logic (IAmountGetter implementation)
     */
    function _getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        // If no iceberg configured, use base implementation
        if (config.configuredAt == 0) {
            return super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData);
        }

        // If iceberg completed, return max value (not executable)
        if (!config.isActive || config.filledAmount >= config.totalMakingAmount) {
            return type(uint256).max;
        }

        // Calculate proportional taking amount based on making amount
        return Math.mulDiv(makingAmount, config.totalTakingAmount, config.totalMakingAmount);
    }

    /**
     * @notice Pre-interaction hook to validate iceberg conditions
     * @dev Called before order execution to ensure chunk is ready
     */
    function preInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external view whenNotPaused {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        // Skip validation if not an iceberg order
        if (config.configuredAt == 0) {
            return;
        }
        
        // Ensure iceberg is still active
        if (!config.isActive) {
            revert IcebergOrderCompleted();
        }
        
        // Check if chunk is ready for execution
        uint256 currentChunkMax = _getCurrentChunkMaxAmount(config);
        if (makingAmount > currentChunkMax) {
            revert ChunkNotReady();
        }
        
        // Validate time-based constraints
        if (config.strategy == RevealStrategy.TIME_BASED) {
            if (block.timestamp < config.lastRevealTime + config.revealInterval) {
                revert ChunkNotReady();
            }
        }
    }

    /**
     * @notice Taker interaction to handle chunk fills and trigger next chunk reveals
     * @dev This is called during order fill to update iceberg state
     */
    function takerInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /* taker */,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external nonReentrant whenNotPaused {
        if (msg.sender != limitOrderProtocol) {
            revert OnlyLimitOrderProtocol();
        }
        
        IcebergConfig storage config = icebergConfigs[orderHash];
        
        // Skip processing if not an iceberg order
        if (config.configuredAt == 0) {
            return;
        }
        
        // Update fill statistics
        _updateFillStats(orderHash, makingAmount, takingAmount);
        
        // Check if chunk is fully filled and needs next chunk reveal
        _checkAndRevealNextChunk(orderHash);
    }

    /**
     * @notice Manually trigger next chunk reveal (keeper or maker only)
     * @param orderHash The order hash to reveal next chunk for
     */
    function revealNextChunk(bytes32 orderHash) 
        external 
        validIceberg(orderHash) 
        nonReentrant 
    {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        // Only keeper or maker can trigger reveals
        if (msg.sender != config.orderMaker && !authorizedKeepers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        
        _revealNextChunk(orderHash);
    }

    /**
     * @notice Get current chunk information for an iceberg order
     * @param orderHash The order hash
     * @return chunkSize Current visible chunk size
     * @return filledAmount Total amount filled so far
     * @return remainingAmount Total remaining amount
     * @return isReady Whether chunk is ready for execution
     */
    function getCurrentChunkInfo(bytes32 orderHash) 
        external 
        view 
        returns (
            uint256 chunkSize,
            uint256 filledAmount,
            uint256 remainingAmount,
            bool isReady
        ) 
    {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        if (config.configuredAt == 0) {
            return (0, 0, 0, false);
        }
        
        chunkSize = _getCurrentChunkMaxAmount(config);
        filledAmount = config.filledAmount;
        remainingAmount = config.totalMakingAmount > filledAmount ? 
            config.totalMakingAmount - filledAmount : 0;
        isReady = config.isActive && remainingAmount > 0;
    }

    /**
     * @notice Check if iceberg order is completed
     * @param orderHash The order hash
     * @return completed Whether the iceberg is fully filled
     * @return fillPercentage Percentage filled (basis points)
     */
    function isIcebergCompleted(bytes32 orderHash) 
        external 
        view 
        returns (bool completed, uint256 fillPercentage) 
    {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        if (config.configuredAt == 0) {
            return (false, 0);
        }
        
        completed = !config.isActive || config.filledAmount >= config.totalMakingAmount;
        fillPercentage = config.totalMakingAmount > 0 ? 
            (config.filledAmount * _BASIS_POINTS_DENOMINATOR) / config.totalMakingAmount : 0;
    }

    /**
     * @notice Remove iceberg configuration (only order maker or owner)
     * @param orderHash The order hash to remove configuration for
     */
    function removeIcebergConfig(bytes32 orderHash) external {
        IcebergConfig memory config = icebergConfigs[orderHash];
        
        // Only order maker or contract owner can remove
        if (msg.sender != config.orderMaker && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        
        delete icebergConfigs[orderHash];
        delete chunkStats[orderHash];
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

    /**
     * @notice Pause iceberg operations
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause iceberg operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // Internal functions

    /**
     * @notice Validate iceberg configuration parameters
     */
    function _validateIcebergConfig(IcebergConfig calldata config) internal pure {
        if (config.totalMakingAmount == 0) {
            revert InvalidTotalAmount();
        }
        if (config.baseChunkSize == 0 || config.baseChunkSize > config.totalMakingAmount) {
            revert InvalidChunkSize();
        }
        if (config.maxVisiblePercent < _MIN_VISIBLE_PERCENT || 
            config.maxVisiblePercent > _MAX_VISIBLE_PERCENT) {
            revert InvalidChunkSize();
        }
        if (config.revealInterval < _MIN_REVEAL_INTERVAL || 
            config.revealInterval > _MAX_REVEAL_INTERVAL) {
            revert InvalidTimeInterval();
        }
        if (config.makerTokenDecimals > 18 || config.takerTokenDecimals > 18) {
            revert InvalidChunkSize();
        }
        if (uint256(config.strategy) > uint256(RevealStrategy.TIME_BASED)) {
            revert InvalidRevealStrategy();
        }
    }

    /**
     * @notice Calculate initial chunk size based on strategy
     */
    function _calculateInitialChunkSize(IcebergConfig calldata config) internal pure returns (uint256) {
        if (config.strategy == RevealStrategy.FIXED_SIZE) {
            return config.baseChunkSize;
        } else if (config.strategy == RevealStrategy.PERCENTAGE) {
            return Math.mulDiv(config.totalMakingAmount, config.maxVisiblePercent, _BASIS_POINTS_DENOMINATOR);
        } else if (config.strategy == RevealStrategy.TIME_BASED) {
            // Start with smaller chunks for time-based strategy
            return config.baseChunkSize / 2;
        } else {
            // ADAPTIVE - start with base chunk size
            return config.baseChunkSize;
        }
    }

    /**
     * @notice Get current chunk maximum amount based on strategy and state
     */
    function _getCurrentChunkMaxAmount(IcebergConfig memory config) internal view returns (uint256) {
        uint256 remainingAmount = config.totalMakingAmount > config.filledAmount ? 
            config.totalMakingAmount - config.filledAmount : 0;
        
        if (remainingAmount == 0) {
            return 0;
        }
        
        uint256 calculatedChunkSize;
        
        if (config.strategy == RevealStrategy.FIXED_SIZE) {
            calculatedChunkSize = config.baseChunkSize;
        } else if (config.strategy == RevealStrategy.PERCENTAGE) {
            calculatedChunkSize = Math.mulDiv(remainingAmount, config.maxVisiblePercent, _BASIS_POINTS_DENOMINATOR);
        } else if (config.strategy == RevealStrategy.TIME_BASED) {
            calculatedChunkSize = _calculateTimeBasedChunkSize(config);
        } else {
            // ADAPTIVE
            calculatedChunkSize = _calculateAdaptiveChunkSize(config);
        }
        
        // Ensure chunk doesn't exceed remaining amount
        return Math.min(calculatedChunkSize, remainingAmount);
    }

    /**
     * @notice Calculate time-based chunk size that increases over time
     */
    function _calculateTimeBasedChunkSize(IcebergConfig memory config) internal view returns (uint256) {
        uint256 timeElapsed = block.timestamp - config.configuredAt;
        uint256 timeMultiplier = 100 + (timeElapsed / config.revealInterval); // Increase 1% per interval
        
        uint256 adjustedChunkSize = Math.mulDiv(config.baseChunkSize, timeMultiplier, 100);
        uint256 maxChunk = Math.mulDiv(config.totalMakingAmount, config.maxVisiblePercent, _BASIS_POINTS_DENOMINATOR);
        
        return Math.min(adjustedChunkSize, maxChunk);
    }

    /**
     * @notice Calculate adaptive chunk size based on fill performance
     */
    function _calculateAdaptiveChunkSize(IcebergConfig memory config) internal view returns (uint256) {
        ChunkStats memory stats = chunkStats[bytes32(uint256(uint160(config.orderMaker)))];
        
        uint256 baseSize = config.baseChunkSize;
        uint256 multiplier = _ADAPTIVE_MULTIPLIER_BASE;
        
        if (stats.totalChunks > 0) {
            // Increase chunk size if filling too quickly
            if (stats.fastFills > stats.slowFills) {
                multiplier = 150; // 1.5x
            }
            // Decrease chunk size if filling too slowly
            else if (stats.slowFills > stats.fastFills) {
                multiplier = 75; // 0.75x
            }
        }
        
        uint256 adjustedSize = Math.mulDiv(baseSize, multiplier, _ADAPTIVE_MULTIPLIER_BASE);
        uint256 maxChunk = Math.mulDiv(config.totalMakingAmount, config.maxVisiblePercent, _BASIS_POINTS_DENOMINATOR);
        
        return Math.min(adjustedSize, maxChunk);
    }

    /**
     * @notice Update fill statistics for adaptive strategy
     */
    function _updateFillStats(bytes32 orderHash, uint256 makingAmount, uint256 takingAmount) internal {
        IcebergConfig storage config = icebergConfigs[orderHash];
        ChunkStats storage stats = chunkStats[orderHash];
        
        // Update filled amount
        config.filledAmount += makingAmount;
        
        // Calculate fill price for price improvement tracking
        uint256 currentPrice = Math.mulDiv(takingAmount, 10**18, makingAmount);
        
        // Update fill timing statistics
        uint256 fillTime = block.timestamp - config.lastFillTime;
        if (config.lastFillTime > 0) {
            stats.totalFillTime += fillTime;
            stats.totalChunks++;
            stats.averageFillTime = stats.totalFillTime / stats.totalChunks;
            
            // Track fast vs slow fills
            if (fillTime < _FAST_FILL_THRESHOLD) {
                stats.fastFills++;
            } else if (fillTime > _SLOW_FILL_THRESHOLD) {
                stats.slowFills++;
            }
        }
        
        // Update timestamps and price
        config.lastFillTime = block.timestamp;
        config.lastPrice = currentPrice;
        
        emit ChunkFilled(orderHash, stats.totalChunks, makingAmount, currentPrice, fillTime);
    }

    /**
     * @notice Check if chunk is filled and reveal next chunk if needed
     */
    function _checkAndRevealNextChunk(bytes32 orderHash) internal {
        IcebergConfig storage config = icebergConfigs[orderHash];
        
        // Check if order is completely filled
        if (config.filledAmount >= config.totalMakingAmount) {
            config.isActive = false;
            
            ChunkStats memory stats = chunkStats[orderHash];
            emit IcebergCompleted(orderHash, config.filledAmount, stats.totalChunks, stats.averageFillTime);
            return;
        }
        
        // Check if current chunk is mostly filled (>90%) and time interval passed
        uint256 currentChunkFilled = config.filledAmount % config.currentVisibleAmount;
        uint256 chunkFillPercent = Math.mulDiv(currentChunkFilled, 100, config.currentVisibleAmount);
        
        bool timeConditionMet = block.timestamp >= config.lastRevealTime + config.revealInterval;
        bool fillConditionMet = chunkFillPercent >= 90;
        
        if (timeConditionMet && fillConditionMet) {
            _revealNextChunk(orderHash);
        }
    }

    /**
     * @notice Reveal next chunk for the iceberg order
     */
    function _revealNextChunk(bytes32 orderHash) internal {
        IcebergConfig storage config = icebergConfigs[orderHash];
        
        // Calculate next chunk size
        uint256 nextChunkSize = _getCurrentChunkMaxAmount(config);
        
        if (nextChunkSize == 0) {
            config.isActive = false;
            return;
        }
        
        // Check price improvement requirement
        if (config.minPriceImprovement > 0 && config.lastPrice > 0) {
            // For simplicity, we'll skip price improvement check in V1
            // This would typically require current market price data
        }
        
        // Update visible amount and reveal time
        config.currentVisibleAmount = nextChunkSize;
        config.lastRevealTime = block.timestamp;
        
        ChunkStats memory stats = chunkStats[orderHash];
        emit ChunkRevealed(
            orderHash, 
            stats.totalChunks + 1, 
            nextChunkSize, 
            config.filledAmount,
            config.totalMakingAmount - config.filledAmount
        );
    }
}