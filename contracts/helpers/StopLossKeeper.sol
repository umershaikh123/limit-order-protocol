// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { TakerTraits, TakerTraitsLib } from "../libraries/TakerTraitsLib.sol";
import "../interfaces/IOrderMixin.sol";
import "../extensions/StopLossMarketOrder.sol";

/**
 * @title StopLossKeeper
 * @notice Automated keeper contract for monitoring and executing stop loss orders
 * @dev This contract can be called by Chainlink Automation or other keeper networks
 */
contract StopLossKeeper is Ownable, Pausable {
    using AddressLib for Address;
    using TakerTraitsLib for TakerTraits;
    error OrderNotFound();
    error StopLossNotConfigured();
    error AlreadyExecuted();
    error ExecutionFailed();

    struct MonitoredOrder {
        IOrderMixin.Order order;
        bytes signature;
        bytes32 orderHash;
        bool isActive;
        uint256 addedAt;
    }

    IOrderMixin public immutable limitOrderProtocol;
    StopLossMarketOrder public immutable stopLossExtension;
    
    // Orders being monitored for stop loss
    mapping(bytes32 => MonitoredOrder) public monitoredOrders;
    bytes32[] public orderHashes;
    
    // Executed orders tracking
    mapping(bytes32 => bool) public executedOrders;
    
    // Keeper rewards
    uint256 public keeperReward = 0.001 ether;
    mapping(address => uint256) public keeperBalances;

    event OrderAdded(bytes32 indexed orderHash, address indexed maker);
    event OrderExecuted(bytes32 indexed orderHash, address indexed keeper, uint256 reward);
    event OrderRemoved(bytes32 indexed orderHash);
    event KeeperRewardUpdated(uint256 newReward);

    constructor(
        address _limitOrderProtocol,
        address _stopLossExtension
    ) Ownable(msg.sender) {
        limitOrderProtocol = IOrderMixin(_limitOrderProtocol);
        stopLossExtension = StopLossMarketOrder(_stopLossExtension);
    }

    /**
     * @notice Add an order to be monitored for stop loss
     * @param order The limit order to monitor
     * @param signature The order signature
     * @param swapData The data for executing market order via 1inch router
     */
    function addOrder(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        bytes calldata swapData
    ) external {
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);
        
        // Verify stop loss is configured
        (bool isConfigured, ) = _isStopLossConfigured(orderHash);
        if (!isConfigured) {
            revert StopLossNotConfigured();
        }
        
        monitoredOrders[orderHash] = MonitoredOrder({
            order: order,
            signature: signature,
            orderHash: orderHash,
            isActive: true,
            addedAt: block.timestamp
        });
        
        orderHashes.push(orderHash);
        
        emit OrderAdded(orderHash, order.maker.get());
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
    function performUpkeep(bytes calldata performData) external whenNotPaused {
        bytes32[] memory ordersToExecute = abi.decode(performData, (bytes32[]));
        
        for (uint256 i = 0; i < ordersToExecute.length; i++) {
            _executeStopLoss(ordersToExecute[i]);
        }
    }

    /**
     * @notice Manually execute a specific stop loss order
     * @param orderHash The order to execute
     * @param swapData Updated swap data for market execution
     */
    function executeStopLoss(bytes32 orderHash, bytes calldata swapData) external whenNotPaused {
        _executeStopLoss(orderHash);
    }

    /**
     * @notice Internal function to execute stop loss
     */
    function _executeStopLoss(bytes32 orderHash) internal {
        MonitoredOrder memory monitoredOrder = monitoredOrders[orderHash];
        
        if (!monitoredOrder.isActive) {
            revert OrderNotFound();
        }
        
        if (executedOrders[orderHash]) {
            revert AlreadyExecuted();
        }
        
        // Verify stop loss is still triggered
        (bool triggered, ) = stopLossExtension.isStopLossTriggered(orderHash);
        if (!triggered) {
            return;
        }
        
        // Mark as executed before external call
        executedOrders[orderHash] = true;
        monitoredOrder.isActive = false;
        
        // Prepare taker traits for execution
        // This would need to be properly encoded based on the order requirements
        TakerTraits takerTraits = TakerTraits.wrap(0); // Simplified - would need proper encoding
        bytes memory args = ""; // Simplified - would need proper args
        
        try limitOrderProtocol.fillOrderArgs(
            monitoredOrder.order,
            bytes32(monitoredOrder.signature), // r component
            bytes32(0), // vs component - would need proper extraction
            monitoredOrder.order.makingAmount,
            takerTraits,
            args
        ) returns (uint256, uint256, bytes32) {
            // Success - pay keeper reward
            keeperBalances[msg.sender] += keeperReward;
            emit OrderExecuted(orderHash, msg.sender, keeperReward);
        } catch {
            // Revert state changes on failure
            executedOrders[orderHash] = false;
            monitoredOrder.isActive = true;
            revert ExecutionFailed();
        }
    }

    /**
     * @notice Remove an order from monitoring
     * @param orderHash The order to remove
     */
    function removeOrder(bytes32 orderHash) external {
        MonitoredOrder memory order = monitoredOrders[orderHash];
        if (order.order.maker.get() != msg.sender && owner() != msg.sender) {
            revert("Unauthorized");
        }
        
        monitoredOrders[orderHash].isActive = false;
        emit OrderRemoved(orderHash);
    }

    /**
     * @notice Update keeper reward amount
     * @param newReward The new reward amount in wei
     */
    function updateKeeperReward(uint256 newReward) external onlyOwner {
        keeperReward = newReward;
        emit KeeperRewardUpdated(newReward);
    }

    /**
     * @notice Withdraw accumulated keeper rewards
     */
    function withdrawRewards() external {
        uint256 balance = keeperBalances[msg.sender];
        require(balance > 0, "No rewards");
        
        keeperBalances[msg.sender] = 0;
        payable(msg.sender).transfer(balance);
    }

    /**
     * @notice Fund the contract for keeper rewards
     */
    receive() external payable {}

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
            if (monitoredOrders[orderHashes[i]].isActive && !executedOrders[orderHashes[i]]) {
                activeCount++;
            }
        }
        
        activeOrders = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < orderHashes.length; i++) {
            if (monitoredOrders[orderHashes[i]].isActive && !executedOrders[orderHashes[i]]) {
                activeOrders[index] = orderHashes[i];
                index++;
            }
        }
    }

    /**
     * @notice Check if stop loss is configured for an order
     */
    function _isStopLossConfigured(bytes32 orderHash) internal view returns (bool, uint256) {
        return stopLossExtension.isStopLossTriggered(orderHash);
    }
}