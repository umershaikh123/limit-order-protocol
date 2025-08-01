// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "../interfaces/IOrderMixin.sol";
import "../interfaces/IAmountGetter.sol";
import "../interfaces/IPreInteraction.sol";
import "../libraries/MakerTraitsLib.sol";
import "./AmountGetterBase.sol";

/**
 * @title OCOOrderV1
 * @notice One Cancels Other (OCO) extension for the 1inch Limit Order Protocol
 * @dev Allows traders to create linked order pairs where execution of one automatically cancels the other
 * 
 * Key Features:
 * - Bracket OCO: Take Profit + Stop Loss orders
 * - Breakout OCO: Buy High + Buy Low orders  
 * - Range OCO: Sell High + Buy Low for range trading
 * - Decentralized keeper network for automated cancellation
 * - IAmountGetter integration for conditional execution
 * - Gas-optimized batch operations
 * 
 * Usage:
 * 1. Create two standard limit orders
 * 2. Configure OCO relationship linking the orders
 * 3. Extension monitors order execution via preInteraction
 * 4. When one order fills, the other is automatically cancelled
 */
contract OCOOrderV1 is AmountGetterBase, IPreInteraction, Ownable, Pausable, ReentrancyGuard {
    using AddressLib for Address;
    using SafeERC20 for IERC20;

    // OCO Strategy Types
    enum OCOStrategy {
        BRACKET,    // Take Profit + Stop Loss (most common)
        BREAKOUT,   // Buy High + Buy Low
        RANGE       // Sell High + Buy Low
    }

    // OCO Configuration
    struct OCOConfig {
        bytes32 primaryOrderHash;      // First order in the pair
        bytes32 secondaryOrderHash;    // Second order in the pair
        address orderMaker;            // Order creator (must match both orders)
        OCOStrategy strategy;          // OCO strategy type
        bool isPrimaryExecuted;        // Track if primary order was filled
        bool isSecondaryExecuted;      // Track if secondary order was filled  
        bool isActive;                 // OCO pair is active
        uint256 configuredAt;          // Configuration timestamp
        address authorizedKeeper;      // Specific keeper (or address(0) for any)
        uint256 maxGasPrice;           // Maximum gas price for keeper operations
        uint256 expiresAt;             // OCO pair expiration timestamp
    }

    // Pending Cancellation Request
    struct CancellationRequest {
        bytes32 orderHash;             // Order to cancel
        bytes32 ocoId;                 // Associated OCO ID
        uint256 requestedAt;           // When cancellation was requested
        address requestedBy;           // Who requested the cancellation
        bool processed;                // Whether cancellation was processed
    }

    // Events
    event OCOConfigured(
        bytes32 indexed ocoId,
        bytes32 indexed primaryOrderHash,
        bytes32 indexed secondaryOrderHash,
        address orderMaker,
        OCOStrategy strategy
    );

    event OCOExecuted(
        bytes32 indexed ocoId,
        bytes32 indexed executedOrderHash,  
        bytes32 indexed cancelledOrderHash,
        address taker,
        uint256 timestamp
    );

    event CancellationRequested(
        bytes32 indexed orderHash,
        bytes32 indexed ocoId,
        address indexed requestedBy,
        uint256 timestamp
    );

    event CancellationProcessed(
        bytes32 indexed orderHash,
        bytes32 indexed ocoId,
        address indexed processedBy,
        uint256 timestamp
    );

    event KeeperAuthorized(address indexed keeper, bool authorized);
    event EmergencyTokenRecovery(address indexed token, address indexed to, uint256 amount);

    // Errors
    error OCOAlreadyConfigured();
    error OCONotConfigured();
    error OCONotActive();
    error UnauthorizedCaller();
    error UnauthorizedKeeper();
    error InvalidOCOConfiguration();
    error OrderAlreadyExecuted();
    error OCOExpired();
    error InvalidStrategy();
    error CancellationAlreadyRequested();
    error CancellationNotReady();
    error MaxGasPriceExceeded();
    error SameOrderHash();
    error InvalidTimeLimit();

    // Storage
    mapping(bytes32 => OCOConfig) public ocoConfigs;                    // ocoId => OCO configuration
    mapping(bytes32 => bytes32) public orderToOCO;                     // orderHash => ocoId
    mapping(address => bool) public authorizedKeepers;                 // keeper => authorized
    mapping(bytes32 => CancellationRequest) public cancellationRequests; // orderHash => cancellation request
    
    // Constants
    uint256 private constant _DEFAULT_CANCELLATION_DELAY = 30 seconds;  // Minimum delay before cancellation
    uint256 private constant _MAX_GAS_PRICE = 500 gwei;                 // Maximum allowed gas price
    uint256 private constant _MAX_TIME_LIMIT = 30 days;                 // Maximum OCO duration

    // State
    address public immutable limitOrderProtocol;
    uint256 public cancellationDelay = _DEFAULT_CANCELLATION_DELAY;

    // Modifiers
    modifier onlyAuthorizedKeeper() {
        if (!authorizedKeepers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedKeeper();
        }
        _;
    }

    modifier validOCO(bytes32 ocoId) {
        OCOConfig storage config = ocoConfigs[ocoId];
        if (config.configuredAt == 0) revert OCONotConfigured();
        if (!config.isActive) revert OCONotActive();
        if (block.timestamp > config.expiresAt) revert OCOExpired();
        _;
    }

    modifier onlyOrderMaker(bytes32 ocoId) {
        OCOConfig storage config = ocoConfigs[ocoId];
        if (msg.sender != config.orderMaker && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    constructor(address _limitOrderProtocol) 
        Ownable(msg.sender) 
    {
        limitOrderProtocol = _limitOrderProtocol;
    }

    /**
     * @notice Configure OCO relationship between two orders
     * @param ocoId Unique identifier for the OCO pair (typically hash of both order hashes)
     * @param config OCO configuration parameters
     */
    function configureOCO(
        bytes32 ocoId,
        OCOConfig calldata config
    ) external whenNotPaused nonReentrant {
        // Validate configuration
        if (ocoConfigs[ocoId].configuredAt != 0) revert OCOAlreadyConfigured();
        if (config.primaryOrderHash == config.secondaryOrderHash) revert SameOrderHash();
        if (config.orderMaker != msg.sender) revert UnauthorizedCaller();
        if (config.expiresAt <= block.timestamp || config.expiresAt > block.timestamp + _MAX_TIME_LIMIT) {
            revert InvalidTimeLimit();
        }
        if (uint256(config.strategy) > uint256(OCOStrategy.RANGE)) revert InvalidStrategy();
        if (config.maxGasPrice > _MAX_GAS_PRICE) revert MaxGasPriceExceeded();

        // Store configuration
        ocoConfigs[ocoId] = OCOConfig({
            primaryOrderHash: config.primaryOrderHash,
            secondaryOrderHash: config.secondaryOrderHash,
            orderMaker: config.orderMaker,
            strategy: config.strategy,
            isPrimaryExecuted: false,
            isSecondaryExecuted: false,
            isActive: true,
            configuredAt: block.timestamp,
            authorizedKeeper: config.authorizedKeeper,
            maxGasPrice: config.maxGasPrice,
            expiresAt: config.expiresAt
        });

        // Map orders to OCO ID
        orderToOCO[config.primaryOrderHash] = ocoId;
        orderToOCO[config.secondaryOrderHash] = ocoId;

        emit OCOConfigured(
            ocoId,
            config.primaryOrderHash,
            config.secondaryOrderHash,
            config.orderMaker,
            config.strategy
        );
    }

    /**
     * @notice Remove OCO configuration (only order maker or owner)
     * @param ocoId OCO identifier to remove
     */
    function removeOCOConfig(bytes32 ocoId) external onlyOrderMaker(ocoId) {
        OCOConfig storage config = ocoConfigs[ocoId];
        
        // Clean up mappings
        delete orderToOCO[config.primaryOrderHash];
        delete orderToOCO[config.secondaryOrderHash];
        delete ocoConfigs[ocoId];
    }

    /**
     * @notice Authorize or revoke keeper permissions
     * @param keeper Keeper address
     * @param authorized Authorization status
     */
    function setKeeperAuthorization(address keeper, bool authorized) external onlyOwner {
        authorizedKeepers[keeper] = authorized;
        emit KeeperAuthorized(keeper, authorized);
    }

    /**
     * @notice Set cancellation delay
     * @param delay New delay in seconds
     */
    function setCancellationDelay(uint256 delay) external onlyOwner {
        cancellationDelay = delay;
    }

    /**
     * @notice IAmountGetter implementation - returns normal amounts for active OCO orders
     */
    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view override returns (uint256) {
        bytes32 ocoId = orderToOCO[orderHash];
        
        // If not part of OCO, use default behavior
        if (ocoId == bytes32(0)) {
            return super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData);
        }

        OCOConfig storage config = ocoConfigs[ocoId];
        
        // If OCO is not active or expired, prevent execution
        if (!config.isActive || block.timestamp > config.expiresAt) {
            return 0;
        }

        // If other order in pair was already executed, prevent execution
        if (orderHash == config.primaryOrderHash && config.isSecondaryExecuted) {
            return 0;
        }
        if (orderHash == config.secondaryOrderHash && config.isPrimaryExecuted) {
            return 0;
        }

        // Return normal making amount for active OCO order
        return super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData);
    }

    /**
     * @notice IAmountGetter implementation - returns normal amounts for active OCO orders
     */
    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view override returns (uint256) {
        bytes32 ocoId = orderToOCO[orderHash];
        
        // If not part of OCO, use default behavior
        if (ocoId == bytes32(0)) {
            return super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData);
        }

        OCOConfig storage config = ocoConfigs[ocoId];
        
        // If OCO is not active or expired, prevent execution
        if (!config.isActive || block.timestamp > config.expiresAt) {
            return type(uint256).max; // Prevent execution
        }

        // If other order in pair was already executed, prevent execution
        if (orderHash == config.primaryOrderHash && config.isSecondaryExecuted) {
            return type(uint256).max;
        }
        if (orderHash == config.secondaryOrderHash && config.isPrimaryExecuted) {
            return type(uint256).max;
        }

        // Return normal taking amount for active OCO order
        return super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData);
    }

    /**
     * @notice Pre-interaction hook called before order execution
     * @dev This is where we detect order execution and trigger OCO logic
     */
    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external override whenNotPaused {
        // Only allow calls from the limit order protocol
        if (msg.sender != limitOrderProtocol) revert UnauthorizedCaller();

        bytes32 ocoId = orderToOCO[orderHash];
        if (ocoId == bytes32(0)) return; // Not an OCO order

        OCOConfig storage config = ocoConfigs[ocoId];
        if (!config.isActive) return; // OCO already processed

        // Check gas price limit if specified
        if (config.maxGasPrice > 0 && tx.gasprice > config.maxGasPrice) {
            revert MaxGasPriceExceeded();
        }

        bytes32 orderToCancel;
        
        // Determine which order to cancel based on which one is being executed
        if (orderHash == config.primaryOrderHash) {
            if (config.isPrimaryExecuted) revert OrderAlreadyExecuted();
            config.isPrimaryExecuted = true;
            orderToCancel = config.secondaryOrderHash;
        } else if (orderHash == config.secondaryOrderHash) {
            if (config.isSecondaryExecuted) revert OrderAlreadyExecuted();
            config.isSecondaryExecuted = true;
            orderToCancel = config.primaryOrderHash;
        } else {
            return; // Should not happen, but safety check
        }

        // Deactivate OCO pair immediately to prevent race conditions
        config.isActive = false;

        // Request cancellation of the other order
        _requestCancellation(orderToCancel, ocoId);

        emit OCOExecuted(ocoId, orderHash, orderToCancel, taker, block.timestamp);
    }

    /**
     * @notice Request cancellation of an order (internal)
     * @param orderHash Order to cancel
     * @param ocoId Associated OCO ID
     */
    function _requestCancellation(bytes32 orderHash, bytes32 ocoId) internal {
        if (cancellationRequests[orderHash].requestedAt != 0) {
            revert CancellationAlreadyRequested();
        }

        cancellationRequests[orderHash] = CancellationRequest({
            orderHash: orderHash,
            ocoId: ocoId,
            requestedAt: block.timestamp,
            requestedBy: tx.origin, // Use tx.origin to get the actual user
            processed: false
        });

        emit CancellationRequested(orderHash, ocoId, tx.origin, block.timestamp);
    }

    /**
     * @notice Process pending cancellation (called by keeper)
     * @param orderHash Order to cancel
     * @param makerTraits Maker traits for the order
     */
    function processCancellation(
        bytes32 orderHash,
        MakerTraits makerTraits
    ) external onlyAuthorizedKeeper whenNotPaused nonReentrant {
        CancellationRequest storage request = cancellationRequests[orderHash];
        
        if (request.requestedAt == 0) revert OCONotConfigured();
        if (request.processed) return; // Already processed
        if (block.timestamp < request.requestedAt + cancellationDelay) {
            revert CancellationNotReady();
        }

        OCOConfig storage config = ocoConfigs[request.ocoId];
        
        // Check keeper authorization for specific OCO
        if (config.authorizedKeeper != address(0) && config.authorizedKeeper != msg.sender) {
            revert UnauthorizedKeeper();
        }

        // Mark as processed before external call
        request.processed = true;

        // Cancel the order through the limit order protocol
        try IOrderMixin(limitOrderProtocol).cancelOrder(makerTraits, orderHash) {
            emit CancellationProcessed(orderHash, request.ocoId, msg.sender, block.timestamp);
        } catch {
            // If cancellation fails (e.g., order already filled), mark as processed anyway
            // This prevents the keeper from trying again
        }
    }

    /**
     * @notice Batch process multiple cancellations (gas efficient)
     * @param orderHashes Orders to cancel
     * @param makerTraits Maker traits for each order
     */
    function batchProcessCancellations(
        bytes32[] calldata orderHashes,
        MakerTraits[] calldata makerTraits
    ) external onlyAuthorizedKeeper whenNotPaused nonReentrant {
        if (orderHashes.length != makerTraits.length) revert InvalidOCOConfiguration();
        
        for (uint256 i = 0; i < orderHashes.length; i++) {
            // Use try-catch to continue processing even if one fails
            try this.processCancellation(orderHashes[i], makerTraits[i]) {
                // Success
            } catch {
                // Continue with next cancellation
            }
        }
    }

    /**
     * @notice Get OCO configuration
     * @param ocoId OCO identifier
     * @return config OCO configuration
     */
    function getOCOConfig(bytes32 ocoId) external view returns (OCOConfig memory config) {
        return ocoConfigs[ocoId];
    }

    /**
     * @notice Check if an order is part of an active OCO pair
     * @param orderHash Order hash to check
     * @return isOCO Whether the order is part of an OCO
     * @return ocoId The OCO identifier
     * @return isActive Whether the OCO is active
     */
    function getOrderOCOStatus(bytes32 orderHash) 
        external 
        view 
        returns (bool isOCO, bytes32 ocoId, bool isActive) 
    {
        ocoId = orderToOCO[orderHash];
        isOCO = ocoId != bytes32(0);
        if (isOCO) {
            OCOConfig storage config = ocoConfigs[ocoId];
            isActive = config.isActive && block.timestamp <= config.expiresAt;
        }
    }

    /**
     * @notice Get pending cancellations ready for processing
     * @param maxCount Maximum number of cancellations to return
     * @return orderHashes Orders ready for cancellation
     * @return count Number of orders returned
     */
    function getPendingCancellations(uint256 maxCount) 
        external 
        view 
        returns (bytes32[] memory orderHashes, uint256 count) 
    {
        // This is a simplified implementation - in production, you'd want to maintain
        // a more efficient data structure for pending cancellations
        bytes32[] memory result = new bytes32[](maxCount);
        // Implementation would iterate through known pending cancellations
        // For now, return empty array as this requires additional indexing
        return (result, 0);
    }

    /**
     * @notice Emergency token recovery (only owner)
     * @param token Token to recover
     * @param to Recipient address
     * @param amount Amount to recover
     */
    function emergencyRecoverToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyTokenRecovery(token, to, amount);
    }

    /**
     * @notice Pause contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}