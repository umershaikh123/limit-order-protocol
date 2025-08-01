// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import "../extensions/IcebergOrderV1.sol";

/**
 * @title MockIcebergKeeper
 * @notice Mock keeper contract for testing iceberg order automation
 * @dev Simulates Chainlink Automation-compatible keeper behavior
 */
contract MockIcebergKeeper is Ownable, Pausable, ReentrancyGuard {
    using AddressLib for Address;
    
    error OrderNotFound();
    error OrderAlreadyRegistered();
    error KeeperNotAuthorized();
    error OrderAlreadyExpired();
    error NoUpkeepNeeded();

    struct RegisteredOrder {
        bytes32 orderHash;
        address maker;
        bytes signature;
        uint256 expiresAt;
        bool isActive;
        uint256 registeredAt;
    }

    mapping(bytes32 => RegisteredOrder) public registeredOrders;
    mapping(address => bool) public authorizedKeepers;
    bytes32[] public activeOrderHashes;

    IcebergOrderV1 public immutable icebergExtension;
    address public immutable limitOrderProtocol;

    event OrderRegistered(bytes32 indexed orderHash, address indexed maker, uint256 expiresAt);
    event OrderExecuted(bytes32 indexed orderHash, address indexed keeper, uint256 timestamp);
    event OrderExpired(bytes32 indexed orderHash, uint256 timestamp);
    event KeeperAuthorized(address indexed keeper, bool authorized);

    modifier onlyAuthorizedKeeper() {
        if (!authorizedKeepers[msg.sender] && msg.sender != owner()) {
            revert KeeperNotAuthorized();
        }
        _;
    }

    constructor(
        address _limitOrderProtocol,
        address _icebergExtension
    ) Ownable(msg.sender) {
        limitOrderProtocol = _limitOrderProtocol;
        icebergExtension = IcebergOrderV1(_icebergExtension);
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
     * @notice Register an iceberg order for monitoring
     * @param order The limit order struct
     * @param signature The order signature
     * @param expiresAt Expiration timestamp
     */
    function registerOrder(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 expiresAt
    ) external {
        bytes32 orderHash = _hashOrder(order);
        
        // Check if already registered
        if (registeredOrders[orderHash].isActive) {
            revert OrderAlreadyRegistered();
        }
        
        // Check expiration
        if (expiresAt <= block.timestamp) {
            revert OrderAlreadyExpired();
        }
        
        // Store registered order
        registeredOrders[orderHash] = RegisteredOrder({
            orderHash: orderHash,
            maker: order.maker.get(),
            signature: signature,
            expiresAt: expiresAt,
            isActive: true,
            registeredAt: block.timestamp
        });
        
        activeOrderHashes.push(orderHash);
        
        emit OrderRegistered(orderHash, order.maker.get(), expiresAt);
    }

    /**
     * @notice Check if upkeep is needed (Chainlink Automation compatible)
     * @return upkeepNeeded Whether any orders need chunk reveals or fills
     * @return performData Encoded data for performUpkeep
     */
    function checkUpkeep(bytes calldata /* checkData */) 
        external 
        view 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        bytes32[] memory ordersNeedingUpkeep = new bytes32[](activeOrderHashes.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < activeOrderHashes.length; i++) {
            bytes32 orderHash = activeOrderHashes[i];
            RegisteredOrder memory regOrder = registeredOrders[orderHash];
            
            if (!regOrder.isActive) continue;
            if (regOrder.expiresAt <= block.timestamp) continue;
            
            // Check if iceberg needs chunk reveal or order execution
            try icebergExtension.getCurrentChunkInfo(orderHash) returns (
                uint256 chunkSize,
                uint256 filledAmount,
                uint256 remainingAmount,
                bool isReady
            ) {
                if (isReady && chunkSize > 0 && remainingAmount > 0) {
                    ordersNeedingUpkeep[count] = orderHash;
                    count++;
                }
            } catch {
                // Skip orders with issues
                continue;
            }
        }
        
        if (count > 0) {
            // Resize array to actual count
            bytes32[] memory result = new bytes32[](count);
            for (uint256 i = 0; i < count; i++) {
                result[i] = ordersNeedingUpkeep[i];
            }
            
            upkeepNeeded = true;
            performData = abi.encode(result);
        }
    }

    /**
     * @notice Perform upkeep by revealing next chunks (Chainlink Automation compatible)
     * @param performData Encoded array of order hashes needing upkeep
     */
    function performUpkeep(bytes calldata performData) 
        external 
        onlyAuthorizedKeeper 
        nonReentrant 
        whenNotPaused 
    {
        bytes32[] memory orderHashes = abi.decode(performData, (bytes32[]));
        
        for (uint256 i = 0; i < orderHashes.length; i++) {
            bytes32 orderHash = orderHashes[i];
            RegisteredOrder storage regOrder = registeredOrders[orderHash];
            
            if (!regOrder.isActive) continue;
            if (regOrder.expiresAt <= block.timestamp) {
                _expireOrder(orderHash);
                continue;
            }
            
            try icebergExtension.revealNextChunk(orderHash) {
                emit OrderExecuted(orderHash, msg.sender, block.timestamp);
            } catch {
                // Skip orders that can't be revealed yet
                continue;
            }
        }
    }

    /**
     * @notice Manually expire an order
     * @param orderHash The order hash to expire
     */
    function expireOrder(bytes32 orderHash) external onlyAuthorizedKeeper {
        RegisteredOrder storage regOrder = registeredOrders[orderHash];
        
        if (!regOrder.isActive) {
            revert OrderNotFound();
        }
        
        if (regOrder.expiresAt > block.timestamp) {
            revert OrderAlreadyExpired();
        }
        
        _expireOrder(orderHash);
    }

    /**
     * @notice Get information about a registered order
     * @param orderHash The order hash
     * @return maker The order maker address
     * @return isActive Whether the order is still active
     * @return expiresAt Expiration timestamp
     * @return registeredAt Registration timestamp
     */
    function getOrderInfo(bytes32 orderHash) 
        external 
        view 
        returns (
            address maker,
            bool isActive,
            uint256 expiresAt,
            uint256 registeredAt
        )
    {
        RegisteredOrder memory regOrder = registeredOrders[orderHash];
        return (regOrder.maker, regOrder.isActive, regOrder.expiresAt, regOrder.registeredAt);
    }

    /**
     * @notice Get the count of active registered orders
     * @return count Number of active orders
     */
    function getActiveOrderCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < activeOrderHashes.length; i++) {
            if (registeredOrders[activeOrderHashes[i]].isActive) {
                count++;
            }
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

    // Internal functions

    /**
     * @notice Hash an order (simplified version for testing)
     */
    function _hashOrder(IOrderMixin.Order calldata order) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            order.maker.get(),
            order.makingAmount,
            order.takingAmount
        ));
    }

    /**
     * @notice Internal function to expire an order
     */
    function _expireOrder(bytes32 orderHash) internal {
        registeredOrders[orderHash].isActive = false;
        emit OrderExpired(orderHash, block.timestamp);
    }

    /**
     * @notice Clean up expired orders from active list (gas optimization)
     */
    function cleanupExpiredOrders() external {
        uint256 writeIndex = 0;
        
        for (uint256 i = 0; i < activeOrderHashes.length; i++) {
            bytes32 orderHash = activeOrderHashes[i];
            RegisteredOrder memory regOrder = registeredOrders[orderHash];
            
            if (regOrder.isActive && regOrder.expiresAt > block.timestamp) {
                activeOrderHashes[writeIndex] = orderHash;
                writeIndex++;
            }
        }
        
        // Shrink array
        while (activeOrderHashes.length > writeIndex) {
            activeOrderHashes.pop();
        }
    }
}