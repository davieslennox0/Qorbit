// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title QorbitTreasury
/// @notice Delegated spending for AI agent hierarchies. A treasury agent deposits
/// funds and sets per-worker daily caps, category restrictions, and expiration
/// windows. Workers (or the admin relayer on their behalf) call spend() to pull
/// funds within their allocation.
///
/// Category bitmask: 0x01 = data, 0x02 = compute, 0x04 = storage
contract QorbitTreasury {
    uint256 public constant CAT_DATA    = 0x01;
    uint256 public constant CAT_COMPUTE = 0x02;
    uint256 public constant CAT_STORAGE = 0x04;

    struct Budget {
        address treasury;
        uint256 dailyCap;
        uint256 categoryMask;
        uint256 expiresAt;
        uint256 spentToday;
        uint256 dayStart;
        bool active;
    }

    address public admin;
    mapping(address => uint256) public treasuryBalances;
    // treasury -> worker -> Budget
    mapping(address => mapping(address => Budget)) public budgets;

    event Deposited(address indexed treasury, uint256 amount);
    event BudgetAllocated(
        address indexed treasury,
        address indexed worker,
        uint256 dailyCap,
        uint256 categoryMask,
        uint256 expiresAt
    );
    event BudgetRevoked(address indexed treasury, address indexed worker);
    event SpendExecuted(
        address indexed treasury,
        address indexed worker,
        uint256 amount,
        uint256 category
    );

    error Unauthorized();
    error NoBudget();
    error BudgetExpired();
    error CategoryNotAllowed();
    error DailyCapExceeded();
    error InsufficientTreasuryBalance();
    error TransferFailed();
    error InvalidParams();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Deposit funds into the treasury pool.
    function deposit() external payable {
        treasuryBalances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Admin can deposit on behalf of a treasury agent (relayer pattern).
    function depositFor(address treasury) external payable onlyAdmin {
        treasuryBalances[treasury] += msg.value;
        emit Deposited(treasury, msg.value);
    }

    /// @notice Allocate a spending budget to a worker agent.
    /// @param workerAgent Address of the worker allowed to spend.
    /// @param dailyCap Max amount the worker can spend per 24-hour window (wei).
    /// @param categoryMask Bitmask of allowed spend categories.
    /// @param expiresAt Unix timestamp after which the budget is invalid.
    function allocateBudget(
        address workerAgent,
        uint256 dailyCap,
        uint256 categoryMask,
        uint256 expiresAt
    ) external {
        if (workerAgent == address(0) || dailyCap == 0 || expiresAt <= block.timestamp) revert InvalidParams();
        budgets[msg.sender][workerAgent] = Budget({
            treasury: msg.sender,
            dailyCap: dailyCap,
            categoryMask: categoryMask,
            expiresAt: expiresAt,
            spentToday: 0,
            dayStart: block.timestamp,
            active: true
        });
        emit BudgetAllocated(msg.sender, workerAgent, dailyCap, categoryMask, expiresAt);
    }

    /// @notice Admin can allocate on behalf of a treasury agent (relayer pattern).
    function allocateBudgetFor(
        address treasury,
        address workerAgent,
        uint256 dailyCap,
        uint256 categoryMask,
        uint256 expiresAt
    ) external onlyAdmin {
        if (workerAgent == address(0) || dailyCap == 0 || expiresAt <= block.timestamp) revert InvalidParams();
        budgets[treasury][workerAgent] = Budget({
            treasury: treasury,
            dailyCap: dailyCap,
            categoryMask: categoryMask,
            expiresAt: expiresAt,
            spentToday: 0,
            dayStart: block.timestamp,
            active: true
        });
        emit BudgetAllocated(treasury, workerAgent, dailyCap, categoryMask, expiresAt);
    }

    /// @notice Worker agent calls this to spend from its allocated treasury budget.
    /// @param treasury Address of the treasury funding the spend.
    /// @param amount Amount in wei to transfer to the caller.
    /// @param category Spend category (must be set in the budget's categoryMask).
    function spend(address treasury, uint256 amount, uint256 category) external {
        _spend(treasury, msg.sender, amount, category);
    }

    /// @notice Admin spends on behalf of a worker agent (relayer pattern).
    function spendFor(address treasury, address worker, uint256 amount, uint256 category) external onlyAdmin {
        _spend(treasury, worker, amount, category);
    }

    function _spend(address treasury, address worker, uint256 amount, uint256 category) internal {
        Budget storage b = budgets[treasury][worker];
        if (!b.active) revert NoBudget();
        if (block.timestamp > b.expiresAt) revert BudgetExpired();
        if (b.categoryMask & category == 0) revert CategoryNotAllowed();
        if (treasuryBalances[treasury] < amount) revert InsufficientTreasuryBalance();

        if (block.timestamp >= b.dayStart + 1 days) {
            b.spentToday = 0;
            b.dayStart = block.timestamp;
        }

        if (b.spentToday + amount > b.dailyCap) revert DailyCapExceeded();

        b.spentToday += amount;
        treasuryBalances[treasury] -= amount;

        (bool ok, ) = worker.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit SpendExecuted(treasury, worker, amount, category);
    }

    /// @notice Revoke a worker's budget. Treasury owner or admin only.
    function revokeBudget(address workerAgent) external {
        Budget storage b = budgets[msg.sender][workerAgent];
        if (!b.active) revert NoBudget();
        b.active = false;
        emit BudgetRevoked(msg.sender, workerAgent);
    }

    function revokeBudgetFor(address treasury, address workerAgent) external onlyAdmin {
        Budget storage b = budgets[treasury][workerAgent];
        if (!b.active) revert NoBudget();
        b.active = false;
        emit BudgetRevoked(treasury, workerAgent);
    }

    /// @notice Returns the current state of a worker's budget.
    function getBudget(address treasury, address workerAgent) external view returns (
        uint256 remaining,
        uint256 dailyCap,
        uint256 expiresAt,
        uint256 categoryMask,
        bool active
    ) {
        Budget storage b = budgets[treasury][workerAgent];
        uint256 spent = b.spentToday;
        if (block.timestamp >= b.dayStart + 1 days) spent = 0;
        remaining = b.dailyCap > spent ? b.dailyCap - spent : 0;
        return (remaining, b.dailyCap, b.expiresAt, b.categoryMask, b.active);
    }

    receive() external payable {
        treasuryBalances[msg.sender] += msg.value;
    }
}
