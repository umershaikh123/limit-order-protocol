// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { TakerTraits, TakerTraitsLib } from "../libraries/TakerTraitsLib.sol";
import "../interfaces/IOrderMixin.sol";
import "../extensions/StopLossMarketOrderV2.sol";

/**
 * @title StopLossKeeperV2
 * @notice Production-ready automated keeper contract for monitoring and executing stop loss orders
 * @dev This contract can be called by Chainlink Automation or other keeper networks
 * @dev Supports EIP-1271 contract signatures and follows 1inch protocol patterns
 */
contract StopLossKeeperV2 is Ownable, Pausable, ReentrancyGuard {
    using AddressLib for Address;
    using TakerTraitsLib for TakerTraits;
    using ECDSA for bytes32;

    error OrderNotFound();
    error StopLossNotConfigured();
    error AlreadyExecuted();
    error ExecutionFailed();
    error UnauthorizedKeeper();
    error InvalidSignature();
    error OrderExpiredError();
    error ExcessiveReward();
    error InsufficientBalance();
    error InvalidOrderMaker();
    error DuplicateOrder();
    error InvalidConfiguration();
    error KeeperLimitExceeded();

    struct MonitoredOrder {
        IOrderMixin.Order order;
        bytes signature;
        bytes32 orderHash;
        address submitter; // Who submitted this order for monitoring
        bool isActive;
        uint256 addedAt;
        uint256 expiresAt; // Optional expiration timestamp
        address aggregationRouter; // Router to use for execution
        bytes swapData; // Swap data for market execution
    }

    IOrderMixin public immutable limitOrderProtocol;
    StopLossMarketOrderV2 public immutable stopLossExtension;
    
    // Orders being monitored for stop loss
    mapping(bytes32 => MonitoredOrder) public monitoredOrders;
    bytes32[] public orderHashes;
    
    // Executed orders tracking
    mapping(bytes32 => bool) public executedOrders;
    
    // Keeper management
    mapping(address => bool) public authorizedKeepers;
    uint256 public keeperReward = 0.001 ether;
    uint256 public maxKeeperReward = 0.01 ether;
    mapping(address => uint256) public keeperBalances;
    
    // Security limits
    uint256 public maxOrdersPerKeeper = 100;
    mapping(address => uint256) public keeperOrderCounts;
    
    // Order validation
    uint256 public maxOrderDuration = 30 days;
    
    // Performance tracking
    mapping(address => uint256) public keeperExecutionCount;
    mapping(address => uint256) public keeperLastExecution;
    
    // EIP-1271 support
    bytes4 private constant _EIP1271_MAGIC_VALUE = 0x1626ba7e;

    event OrderAdded(bytes32 indexed orderHash, address indexed maker, address indexed submitter);
    event OrderExecuted(bytes32 indexed orderHash, address indexed keeper, uint256 reward);
    event OrderRemoved(bytes32 indexed orderHash, address indexed remover);
    event KeeperRewardUpdated(uint256 newReward);
    event KeeperAuthorized(address indexed keeper, bool authorized);
    event OrderExpired(bytes32 indexed orderHash);
    event SwapDataUpdated(bytes32 indexed orderHash, address router, bytes swapData);

    modifier onlyAuthorizedKeeper() {
        if (!authorizedKeepers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedKeeper();
        }
        _;
    }

    modifier validOrder(bytes32 orderHash) {
        MonitoredOrder memory order = monitoredOrders[orderHash];
        if (!order.isActive) {
            revert OrderNotFound();
        }
        if (executedOrders[orderHash]) {
            revert AlreadyExecuted();
        }
        _;
    }

    constructor(
        address _limitOrderProtocol,
        address _stopLossExtension
    ) Ownable(msg.sender) {
        if (_limitOrderProtocol == address(0) || _stopLossExtension == address(0)) {
            revert InvalidConfiguration();
        }
        limitOrderProtocol = IOrderMixin(_limitOrderProtocol);
        stopLossExtension = StopLossMarketOrderV2(_stopLossExtension);
    }

    /**
     * @notice Authorize or deauthorize a keeper
     * @param keeper The keeper address to authorize/deauthorize
     * @param authorized Whether to authorize or deauthorize
     */
    function setKeeperAuthorization(address keeper, bool authorized) external onlyOwner {
        authorizedKeepers[keeper] = authorized;
        if (!authorized) {
            keeperOrderCounts[keeper] = 0; // Reset count when deauthorizing
        }
        emit KeeperAuthorized(keeper, authorized);
    }

    /**
     * @notice Add an order to be monitored for stop loss
     * @param order The limit order to monitor
     * @param signature The order signature
     * @param expiresAt Optional expiration timestamp (0 for no expiration)
     * @param aggregationRouter Router to use for market execution
     * @param swapData Swap data for market execution
     */
    function addOrder(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 expiresAt,
        address aggregationRouter,
        bytes calldata swapData
    ) external {
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);
        
        // Prevent duplicate orders
        if (monitoredOrders[orderHash].addedAt != 0) {
            revert DuplicateOrder();
        }
        
        // Only order maker or authorized keeper can add orders
        address orderMaker = order.maker.get();
        if (msg.sender != orderMaker && !authorizedKeepers[msg.sender]) {
            revert UnauthorizedKeeper();
        }
        
        // Validate signature (supports EIP-1271)
        _validateOrderSignature(order, signature, orderHash, orderMaker);
        
        // Verify stop loss is configured by checking if configuration exists
        (, , , , , , , address configOrderMaker, , , ) = stopLossExtension.stopLossConfigs(orderHash);
        if (configOrderMaker == address(0)) {
            revert StopLossNotConfigured();
        }
        
        // Validate router is approved
        if (!stopLossExtension.approvedRouters(aggregationRouter)) {
            revert InvalidConfiguration();
        }
        
        // Validate expiration
        if (expiresAt != 0) {
            if (expiresAt <= block.timestamp) {
                revert OrderExpiredError();
            }
            if (expiresAt > block.timestamp + maxOrderDuration) {
                revert OrderExpiredError();
            }
        }
        
        // Check keeper limits
        if (authorizedKeepers[msg.sender]) {
            if (keeperOrderCounts[msg.sender] >= maxOrdersPerKeeper) {
                revert KeeperLimitExceeded();
            }
            keeperOrderCounts[msg.sender]++;
        }
        
        // Store order
        monitoredOrders[orderHash] = MonitoredOrder({
            order: order,
            signature: signature,
            orderHash: orderHash,
            submitter: msg.sender,
            isActive: true,
            addedAt: block.timestamp,
            expiresAt: expiresAt,
            aggregationRouter: aggregationRouter,
            swapData: swapData
        });
        
        orderHashes.push(orderHash);
        
        emit OrderAdded(orderHash, orderMaker, msg.sender);
    }

    /**
     * @notice Update swap data for an existing monitored order
     * @param orderHash The order hash
     * @param aggregationRouter New router address
     * @param swapData New swap data
     */
    function updateSwapData(
        bytes32 orderHash,
        address aggregationRouter, 
        bytes calldata swapData
    ) external {
        MonitoredOrder storage order = monitoredOrders[orderHash];
        if (!order.isActive) {
            revert OrderNotFound();
        }
        
        address orderMaker = order.order.maker.get();
        if (msg.sender != orderMaker && msg.sender != order.submitter && msg.sender != owner()) {
            revert UnauthorizedKeeper();
        }
        
        // Validate router is approved
        if (!stopLossExtension.approvedRouters(aggregationRouter)) {
            revert InvalidConfiguration();
        }
        
        order.aggregationRouter = aggregationRouter;
        order.swapData = swapData;
        
        emit SwapDataUpdated(orderHash, aggregationRouter, swapData);
    }

    /**
     * @notice Check if any orders need execution (Chainlink Automation compatible)
     * @return upkeepNeeded Whether any order needs execution
     * @return performData Encoded data for execution
     */
    function checkUpkeep(bytes calldata /* checkData */) 
        external 
        view 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        bytes32[] memory ordersToExecute = new bytes32[](orderHashes.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < orderHashes.length; i++) {
            bytes32 orderHash = orderHashes[i];
            MonitoredOrder memory order = monitoredOrders[orderHash];
            
            if (!order.isActive || executedOrders[orderHash]) {
                continue;
            }
            
            // Check if order expired
            if (order.expiresAt != 0 && block.timestamp >= order.expiresAt) {
                continue; // Skip expired orders (will be cleaned up separately)
            }
            
            // Check if stop loss is triggered
            (bool triggered, ) = stopLossExtension.isStopLossTriggered(orderHash);
            if (triggered) {
                ordersToExecute[count] = orderHash;
                count++;
            }
        }
        
        if (count > 0) {
            // Resize array to actual count
            assembly {
                mstore(ordersToExecute, count)
            }
            upkeepNeeded = true;
            performData = abi.encode(ordersToExecute);
        }
    }

    /**
     * @notice Execute stop loss orders (Chainlink Automation compatible)
     * @param performData Encoded order hashes to execute
     */
    function performUpkeep(bytes calldata performData) external whenNotPaused onlyAuthorizedKeeper {
        bytes32[] memory ordersToExecute = abi.decode(performData, (bytes32[]));
        
        for (uint256 i = 0; i < ordersToExecute.length; i++) {
            _executeStopLoss(ordersToExecute[i]);
        }
    }

    /**
     * @notice Manually execute a specific stop loss order
     * @param orderHash The order to execute
     * @param customSwapData Optional custom swap data (empty to use stored data)
     */
    function executeStopLoss(
        bytes32 orderHash,
        bytes calldata customSwapData
    ) external whenNotPaused onlyAuthorizedKeeper validOrder(orderHash) {
        _executeStopLossWithData(orderHash, customSwapData);
    }

    /**
     * @notice Internal function to execute stop loss
     */
    function _executeStopLoss(bytes32 orderHash) internal validOrder(orderHash) {
        MonitoredOrder storage storedOrder = monitoredOrders[orderHash];
        
        // Check expiration
        if (storedOrder.expiresAt != 0 && block.timestamp >= storedOrder.expiresAt) {
            storedOrder.isActive = false;
            emit OrderExpired(orderHash);
            return;
        }
        
        // Verify stop loss is still triggered
        (bool triggered, ) = stopLossExtension.isStopLossTriggered(orderHash);
        if (!triggered) {
            return;
        }
        
        _executeOrderWithStoredData(storedOrder, orderHash);
    }

    /**
     * @notice Internal function to execute stop loss with custom swap data
     */
    function _executeStopLossWithData(
        bytes32 orderHash,
        bytes calldata customSwapData
    ) internal {
        MonitoredOrder storage storedOrder = monitoredOrders[orderHash];
        
        // Use custom swap data if provided, otherwise use stored data
        bytes memory swapData;
        if (customSwapData.length > 0) {
            swapData = customSwapData;
        } else {
            swapData = storedOrder.swapData;
        }
        
        // Mark as executed in storage (CEI pattern)
        executedOrders[orderHash] = true;
        storedOrder.isActive = false;
        
        // Prepare signature components
        (bytes32 r, bytes32 vs) = _splitSignature(storedOrder.signature);
        
        // Encode extraData with router and swap data
        bytes memory extraData = abi.encode(storedOrder.aggregationRouter, swapData);
        
        // Prepare taker traits - simplified for now as enablePreInteraction doesn't exist
        TakerTraits takerTraits = TakerTraits.wrap(0);
        
        try limitOrderProtocol.fillOrderArgs(
            storedOrder.order,
            r,
            vs,
            storedOrder.order.makingAmount,
            takerTraits,
            extraData
        ) returns (uint256, uint256, bytes32) {
            _payKeeperReward(msg.sender);
            _updateKeeperStats(msg.sender);
            emit OrderExecuted(orderHash, msg.sender, keeperReward);
        } catch {
            // Revert state changes
            executedOrders[orderHash] = false;
            storedOrder.isActive = true;
            revert ExecutionFailed();
        }
    }

    /**
     * @notice Execute order with stored data
     */
    function _executeOrderWithStoredData(MonitoredOrder storage storedOrder, bytes32 orderHash) internal {
        // Mark as executed in storage (CEI pattern)
        executedOrders[orderHash] = true;
        storedOrder.isActive = false;
        
        // Prepare signature components
        (bytes32 r, bytes32 vs) = _splitSignature(storedOrder.signature);
        
        // Encode extraData with router and swap data
        bytes memory extraData = abi.encode(storedOrder.aggregationRouter, storedOrder.swapData);
        
        // Prepare taker traits - simplified for now as enablePreInteraction doesn't exist
        TakerTraits takerTraits = TakerTraits.wrap(0);
        
        try limitOrderProtocol.fillOrderArgs(
            storedOrder.order,
            r,
            vs,
            storedOrder.order.makingAmount,
            takerTraits,
            extraData
        ) returns (uint256, uint256, bytes32) {
            _payKeeperReward(msg.sender);
            _updateKeeperStats(msg.sender);
            emit OrderExecuted(orderHash, msg.sender, keeperReward);
        } catch {
            // Revert state changes
            executedOrders[orderHash] = false;
            storedOrder.isActive = true;
            revert ExecutionFailed();
        }
    }

    /**
     * @notice Validate order signature (supports EIP-1271)
     */
    function _validateOrderSignature(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        bytes32 orderHash,
        address orderMaker
    ) internal view {
        if (signature.length != 65) {
            revert InvalidSignature();
        }
        
        // Check if maker is a contract (EIP-1271)
        if (orderMaker.code.length > 0) {
            try IERC1271(orderMaker).isValidSignature(orderHash, signature) returns (bytes4 result) {
                if (result != _EIP1271_MAGIC_VALUE) {
                    revert InvalidSignature();
                }
            } catch {
                revert InvalidSignature();
            }
        } else {
            // EOA signature validation
            address recovered = orderHash.recover(signature);
            if (recovered != orderMaker) {
                revert InvalidSignature();
            }
        }
    }

    /**
     * @notice Split signature into r and vs components
     */
    function _splitSignature(bytes memory signature) internal pure returns (bytes32 r, bytes32 vs) {
        if (signature.length != 65) {
            revert InvalidSignature();
        }
        
        assembly {
            r := mload(add(signature, 32))
            vs := mload(add(signature, 64))
        }
    }

    /**
     * @notice Pay keeper reward securely
     */
    function _payKeeperReward(address keeper) internal {
        if (keeperReward > 0 && address(this).balance >= keeperReward) {
            keeperBalances[keeper] += keeperReward;
        }
    }

    /**
     * @notice Update keeper performance statistics
     */
    function _updateKeeperStats(address keeper) internal {
        keeperExecutionCount[keeper]++;
        keeperLastExecution[keeper] = block.timestamp;
    }

    /**
     * @notice Remove an order from monitoring
     * @param orderHash The order to remove
     */
    function removeOrder(bytes32 orderHash) external {
        MonitoredOrder storage order = monitoredOrders[orderHash];
        if (order.addedAt == 0) {
            revert OrderNotFound();
        }
        
        address orderMaker = order.order.maker.get();
        if (msg.sender != orderMaker && 
            msg.sender != order.submitter && 
            msg.sender != owner()) {
            revert UnauthorizedKeeper();
        }
        
        // Update keeper count if submitter was authorized keeper
        if (authorizedKeepers[order.submitter] && keeperOrderCounts[order.submitter] > 0) {
            keeperOrderCounts[order.submitter]--;
        }
        
        order.isActive = false;
        emit OrderRemoved(orderHash, msg.sender);
    }

    /**
     * @notice Clean up expired orders (anyone can call)
     * @param orderHashes_ Array of order hashes to check for expiration
     */
    function cleanupExpiredOrders(bytes32[] calldata orderHashes_) external {
        for (uint256 i = 0; i < orderHashes_.length; i++) {
            bytes32 orderHash = orderHashes_[i];
            MonitoredOrder storage order = monitoredOrders[orderHash];
            
            if (order.isActive && 
                order.expiresAt != 0 && 
                block.timestamp >= order.expiresAt) {
                
                order.isActive = false;
                
                // Update keeper count if submitter was authorized keeper
                if (authorizedKeepers[order.submitter] && keeperOrderCounts[order.submitter] > 0) {
                    keeperOrderCounts[order.submitter]--;
                }
                
                emit OrderExpired(orderHash);
            }
        }
    }

    /**
     * @notice Update keeper reward amount (only owner)
     * @param newReward The new reward amount in wei
     */
    function updateKeeperReward(uint256 newReward) external onlyOwner {
        if (newReward > maxKeeperReward) {
            revert ExcessiveReward();
        }
        keeperReward = newReward;
        emit KeeperRewardUpdated(newReward);
    }

    /**
     * @notice Set maximum keeper reward (only owner)
     */
    function setMaxKeeperReward(uint256 maxReward) external onlyOwner {
        maxKeeperReward = maxReward;
    }

    /**
     * @notice Set maximum orders per keeper (only owner)
     */
    function setMaxOrdersPerKeeper(uint256 maxOrders) external onlyOwner {
        maxOrdersPerKeeper = maxOrders;
    }

    /**
     * @notice Withdraw accumulated keeper rewards with reentrancy protection
     */
    function withdrawRewards() external nonReentrant {
        uint256 balance = keeperBalances[msg.sender];
        if (balance == 0) {
            revert InsufficientBalance();
        }
        
        // CEI pattern: update state before external call
        keeperBalances[msg.sender] = 0;
        
        // Transfer rewards
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        if (!success) {
            // Revert state change on failure
            keeperBalances[msg.sender] = balance;
            revert ExecutionFailed();
        }
    }

    /**
     * @notice Fund the contract for keeper rewards
     */
    receive() external payable {}

    /**
     * @notice Emergency withdraw (only owner)
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance();
        }
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            revert ExecutionFailed();
        }
    }

    /**
     * @notice Pause keeper operations
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause keeper operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get all active orders
     * @return activeOrders Array of active order hashes
     */
    function getActiveOrders() external view returns (bytes32[] memory activeOrders) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < orderHashes.length; i++) {
            if (monitoredOrders[orderHashes[i]].isActive && 
                !executedOrders[orderHashes[i]]) {
                activeCount++;
            }
        }
        
        activeOrders = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < orderHashes.length; i++) {
            bytes32 orderHash = orderHashes[i];
            if (monitoredOrders[orderHash].isActive && !executedOrders[orderHash]) {
                activeOrders[index] = orderHash;
                index++;
            }
        }
    }

    /**
     * @notice Get keeper performance statistics
     * @param keeper Keeper address
     * @return executionCount Number of orders executed
     * @return lastExecution Timestamp of last execution
     * @return currentOrders Number of orders currently being monitored
     */
    function getKeeperStats(address keeper) external view returns (
        uint256 executionCount,
        uint256 lastExecution,
        uint256 currentOrders
    ) {
        return (
            keeperExecutionCount[keeper],
            keeperLastExecution[keeper], 
            keeperOrderCounts[keeper]
        );
    }
}