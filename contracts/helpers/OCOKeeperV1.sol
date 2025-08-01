// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "../interfaces/IOrderMixin.sol";
import "../libraries/MakerTraitsLib.sol";
import "../extensions/OCOOrderV1.sol";

/**
 * @title OCOKeeperV1
 * @notice Chainlink Automation compatible keeper for OCO order management
 * @dev Monitors OCO pairs and automatically processes cancellations when needed
 * 
 * Features:
 * - Chainlink Automation integration with checkUpkeep/performUpkeep
 * - Batch processing for gas efficiency
 * - Multiple keeper authorization levels
 * - Performance tracking and statistics
 * - Emergency controls and circuit breakers
 * - EIP-1271 signature support for smart contract wallets
 */
contract OCOKeeperV1 is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    // Keeper Performance Stats
    struct KeeperStats {
        uint256 totalExecutions;      // Total cancellations processed
        uint256 successfulExecutions; // Successful cancellations
        uint256 failedExecutions;     // Failed cancellations
        uint256 totalGasUsed;         // Total gas consumed
        uint256 lastExecution;        // Last execution timestamp
        uint256 averageGasUsed;       // Average gas per execution
    }

    // Monitored OCO Order
    struct MonitoredOCO {
        bytes32 ocoId;                // OCO identifier
        bytes32 primaryOrderHash;     // Primary order hash
        bytes32 secondaryOrderHash;   // Secondary order hash
        IOrderMixin.Order primaryOrder;   // Primary order data
        IOrderMixin.Order secondaryOrder; // Secondary order data
        MakerTraits primaryTraits;   // Primary order maker traits
        MakerTraits secondaryTraits; // Secondary order maker traits
        bytes primarySignature;      // Primary order signature
        bytes secondarySignature;     // Secondary order signature
        address orderMaker;           // Order creator
        uint256 expiresAt;            // Expiration timestamp
        bool isActive;                // Whether still being monitored
        uint256 registeredAt;         // Registration timestamp
    }

    // Events
    event OCORegistered(
        bytes32 indexed ocoId,
        address indexed maker,
        uint256 expiresAt
    );

    event OCOExecuted(
        bytes32 indexed ocoId,
        bytes32 indexed executedOrder,
        bytes32 indexed cancelledOrder,
        address keeper,
        uint256 gasUsed
    );

    event KeeperRewardPaid(
        address indexed keeper,
        uint256 amount,
        uint256 executionCount
    );

    event EmergencyStop(address indexed caller, uint256 timestamp);

    // Errors
    error OCOAlreadyRegistered();
    error OCONotFound();
    error UnauthorizedKeeper();
    error InvalidOCOConfiguration();
    error OCOExpired();
    error InsufficientRewardBalance();
    error MaxOrdersPerKeeperExceeded();
    error EmergencyStopActive();

    // Storage
    mapping(bytes32 => MonitoredOCO) public monitoredOCOs;        // ocoId => monitored OCO
    mapping(address => bool) public authorizedKeepers;           // keeper => authorized
    mapping(address => KeeperStats) public keeperStats;         // keeper => statistics
    mapping(address => uint256) public keeperRewardBalances;    // keeper => reward balance
    mapping(address => bytes32[]) public keeperOCOs;            // keeper => OCO IDs
    
    bytes32[] public activeOCOIds;                               // All active OCO IDs
    
    // Configuration
    OCOOrderV1 public immutable ocoExtension;
    address public immutable limitOrderProtocol;
    uint256 public maxOrdersPerKeeper = 100;
    uint256 public keeperRewardPerExecution = 0.001 ether;
    uint256 public maxGasPerExecution = 500_000;
    bool public emergencyStopActive = false;

    // Constants
    uint256 private constant _MAX_BATCH_SIZE = 10;
    uint256 private constant _EXECUTION_TIMEOUT = 5 minutes;

    modifier onlyAuthorizedKeeper() {
        if (!authorizedKeepers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedKeeper();
        }
        _;
    }

    modifier noEmergencyStop() {
        if (emergencyStopActive) revert EmergencyStopActive();
        _;
    }

    constructor(
        address _limitOrderProtocol,
        address _ocoExtension
    ) Ownable(msg.sender) {
        limitOrderProtocol = _limitOrderProtocol;
        ocoExtension = OCOOrderV1(_ocoExtension);
    }

    /**
     * @notice Register OCO pair for monitoring
     * @param ocoId OCO identifier
     * @param primaryOrder Primary order data
     * @param secondaryOrder Secondary order data
     * @param primaryTraits Primary order maker traits
     * @param secondaryTraits Secondary order maker traits
     * @param primarySignature Primary order signature
     * @param secondarySignature Secondary order signature
     * @param expiresAt Expiration timestamp
     */
    function registerOCO(
        bytes32 ocoId,
        IOrderMixin.Order calldata primaryOrder,
        IOrderMixin.Order calldata secondaryOrder,
        MakerTraits primaryTraits,
        MakerTraits secondaryTraits,
        bytes calldata primarySignature,
        bytes calldata secondarySignature,
        uint256 expiresAt
    ) external whenNotPaused noEmergencyStop {
        // Validate caller is order maker
        if (msg.sender != primaryOrder.maker.get() || msg.sender != secondaryOrder.maker.get()) {
            revert UnauthorizedKeeper();
        }

        // Validate OCO configuration exists
        OCOOrderV1.OCOConfig memory config = ocoExtension.getOCOConfig(ocoId);
        if (config.configuredAt == 0) revert OCONotFound();
        if (!config.isActive) revert OCOExpired();

        // Check if already registered
        if (monitoredOCOs[ocoId].registeredAt != 0) revert OCOAlreadyRegistered();

        // Store monitored OCO
        monitoredOCOs[ocoId] = MonitoredOCO({
            ocoId: ocoId,
            primaryOrderHash: IOrderMixin(limitOrderProtocol).hashOrder(primaryOrder),
            secondaryOrderHash: IOrderMixin(limitOrderProtocol).hashOrder(secondaryOrder),
            primaryOrder: primaryOrder,
            secondaryOrder: secondaryOrder,
            primaryTraits: primaryTraits,
            secondaryTraits: secondaryTraits,
            primarySignature: primarySignature,
            secondarySignature: secondarySignature,
            orderMaker: msg.sender,
            expiresAt: expiresAt,
            isActive: true,
            registeredAt: block.timestamp
        });

        activeOCOIds.push(ocoId);

        emit OCORegistered(ocoId, msg.sender, expiresAt);
    }

    /**
     * @notice Chainlink Automation checkUpkeep function
     * @param checkData Optional check data (unused)
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Data for performUpkeep
     */
    function checkUpkeep(bytes calldata checkData) 
        external 
        view 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        checkData; // Silence warning

        if (emergencyStopActive) {
            return (false, "");
        }

        bytes32[] memory readyForCancellation = new bytes32[](_MAX_BATCH_SIZE);
        uint256 count = 0;

        // Check for pending cancellations
        for (uint256 i = 0; i < activeOCOIds.length && count < _MAX_BATCH_SIZE; i++) {
            bytes32 ocoId = activeOCOIds[i];
            MonitoredOCO storage monitored = monitoredOCOs[ocoId];
            
            if (!monitored.isActive || block.timestamp > monitored.expiresAt) {
                continue;
            }

            OCOOrderV1.OCOConfig memory config = ocoExtension.getOCOConfig(ocoId);
            if (!config.isActive) {
                // OCO was executed, check if cancellation is pending
                bytes32 orderToCancel;
                
                if (config.isPrimaryExecuted && !config.isSecondaryExecuted) {
                    orderToCancel = monitored.secondaryOrderHash;
                } else if (config.isSecondaryExecuted && !config.isPrimaryExecuted) {
                    orderToCancel = monitored.primaryOrderHash;
                }

                if (orderToCancel != bytes32(0)) {
                    // Check if cancellation is ready
                    (,, uint256 requestedAt,, bool processed) = ocoExtension.cancellationRequests(orderToCancel);
                    if (requestedAt > 0 && !processed && 
                        block.timestamp >= requestedAt + ocoExtension.cancellationDelay()) {
                        readyForCancellation[count] = ocoId;
                        count++;
                    }
                }
            }
        }

        upkeepNeeded = count > 0;
        if (upkeepNeeded) {
            // Encode OCO IDs for processing
            bytes32[] memory ocoIds = new bytes32[](count);
            for (uint256 i = 0; i < count; i++) {
                ocoIds[i] = readyForCancellation[i];
            }
            performData = abi.encode(ocoIds);
        }
    }

    /**
     * @notice Chainlink Automation performUpkeep function
     * @param performData Data from checkUpkeep
     */
    function performUpkeep(bytes calldata performData) 
        external 
        whenNotPaused 
        noEmergencyStop 
        nonReentrant 
    {
        bytes32[] memory ocoIds = abi.decode(performData, (bytes32[]));
        
        uint256 gasStart = gasleft();
        uint256 successCount = 0;
        uint256 failCount = 0;

        for (uint256 i = 0; i < ocoIds.length && gasleft() > maxGasPerExecution / 10; i++) {
            try this._processSingleOCO(ocoIds[i]) {
                successCount++;
            } catch {
                failCount++;
            }
        }

        // Update keeper statistics
        uint256 gasUsed = gasStart - gasleft();
        _updateKeeperStats(msg.sender, successCount, failCount, gasUsed);

        // Pay keeper reward
        if (successCount > 0) {
            _payKeeperReward(msg.sender, successCount);
        }
    }

    /**
     * @notice Process a single OCO cancellation (external for try-catch)
     * @param ocoId OCO identifier to process
     */
    function _processSingleOCO(bytes32 ocoId) external {
        // Only allow calls from this contract
        if (msg.sender != address(this)) revert UnauthorizedKeeper();

        MonitoredOCO storage monitored = monitoredOCOs[ocoId];
        if (!monitored.isActive) return;

        OCOOrderV1.OCOConfig memory config = ocoExtension.getOCOConfig(ocoId);
        if (config.isActive) return; // OCO not executed yet

        // Determine which order to cancel
        bytes32 orderToCancel;
        MakerTraits traitsToUse;

        if (config.isPrimaryExecuted && !config.isSecondaryExecuted) {
            orderToCancel = monitored.secondaryOrderHash;
            traitsToUse = monitored.secondaryTraits;
        } else if (config.isSecondaryExecuted && !config.isPrimaryExecuted) {
            orderToCancel = monitored.primaryOrderHash;
            traitsToUse = monitored.primaryTraits;
        } else {
            return; // Nothing to cancel
        }

        // Process the cancellation
        ocoExtension.processCancellation(orderToCancel, traitsToUse);

        // Mark as inactive
        monitored.isActive = false;

        emit OCOExecuted(
            ocoId,
            config.isPrimaryExecuted ? monitored.primaryOrderHash : monitored.secondaryOrderHash,
            orderToCancel,
            tx.origin, // The original caller (Chainlink keeper)
            0 // Gas will be calculated in performUpkeep
        );
    }

    /**
     * @notice Update keeper statistics
     */
    function _updateKeeperStats(
        address keeper,
        uint256 successCount,
        uint256 failCount,
        uint256 gasUsed
    ) internal {
        KeeperStats storage stats = keeperStats[keeper];
        
        stats.totalExecutions += successCount + failCount;
        stats.successfulExecutions += successCount;
        stats.failedExecutions += failCount;
        stats.totalGasUsed += gasUsed;
        stats.lastExecution = block.timestamp;
        
        if (stats.totalExecutions > 0) {
            stats.averageGasUsed = stats.totalGasUsed / stats.totalExecutions;
        }
    }

    /**
     * @notice Pay keeper reward
     */
    function _payKeeperReward(address keeper, uint256 executionCount) internal {
        uint256 reward = keeperRewardPerExecution * executionCount;
        
        if (keeperRewardBalances[keeper] >= reward) {
            keeperRewardBalances[keeper] -= reward;
            
            // Transfer reward
            (bool success,) = keeper.call{value: reward}("");
            if (success) {
                emit KeeperRewardPaid(keeper, reward, executionCount);
            }
        }
    }

    /**
     * @notice Authorize keeper
     * @param keeper Keeper address
     * @param authorized Authorization status
     */
    function setKeeperAuthorization(address keeper, bool authorized) external onlyOwner {
        authorizedKeepers[keeper] = authorized;
    }

    /**
     * @notice Set keeper reward per execution
     * @param reward Reward amount in wei
     */
    function setKeeperReward(uint256 reward) external onlyOwner {
        keeperRewardPerExecution = reward;
    }

    /**
     * @notice Set maximum orders per keeper
     * @param maxOrders Maximum number of orders
     */
    function setMaxOrdersPerKeeper(uint256 maxOrders) external onlyOwner {
        maxOrdersPerKeeper = maxOrders;
    }

    /**
     * @notice Fund keeper rewards
     * @param keeper Keeper address
     */
    function fundKeeperRewards(address keeper) external payable onlyOwner {
        keeperRewardBalances[keeper] += msg.value;
    }

    /**
     * @notice Emergency stop all operations
     */
    function emergencyStop() external onlyOwner {
        emergencyStopActive = true;
        _pause();
        emit EmergencyStop(msg.sender, block.timestamp);
    }

    /**
     * @notice Resume operations after emergency stop
     */
    function resumeOperations() external onlyOwner {
        emergencyStopActive = false;
        _unpause();
    }

    /**
     * @notice Get keeper statistics
     * @param keeper Keeper address
     * @return stats Keeper performance statistics
     */
    function getKeeperStats(address keeper) external view returns (KeeperStats memory stats) {
        return keeperStats[keeper];
    }

    /**
     * @notice Get active OCO count
     * @return count Number of active OCOs being monitored
     */
    function getActiveOCOCount() external view returns (uint256 count) {
        count = 0;
        for (uint256 i = 0; i < activeOCOIds.length; i++) {
            if (monitoredOCOs[activeOCOIds[i]].isActive) {
                count++;
            }
        }
    }

    /**
     * @notice Cleanup expired OCOs (gas optimization)
     * @param maxCleanup Maximum number of OCOs to clean up
     */
    function cleanupExpiredOCOs(uint256 maxCleanup) external onlyAuthorizedKeeper {
        uint256 cleaned = 0;
        uint256 i = 0;
        
        while (i < activeOCOIds.length && cleaned < maxCleanup) {
            bytes32 ocoId = activeOCOIds[i];
            MonitoredOCO storage monitored = monitoredOCOs[ocoId];
            
            if (!monitored.isActive || block.timestamp > monitored.expiresAt) {
                // Remove from active list
                activeOCOIds[i] = activeOCOIds[activeOCOIds.length - 1];
                activeOCOIds.pop();
                
                // Mark as inactive
                monitored.isActive = false;
                cleaned++;
            } else {
                i++;
            }
        }
    }

    /**
     * @notice Withdraw excess funds (only owner)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawFunds(address to, uint256 amount) external onlyOwner {
        (bool success,) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    /**
     * @notice Receive ETH for keeper rewards
     */
    receive() external payable {
        // Allow receiving ETH for keeper rewards
    }
}