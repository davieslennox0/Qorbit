// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title QorbitBilling
/// @notice Recurring subscription payments for AI agents on Qorbitpay.
/// Subscribers deposit a balance upfront; anyone can call processPayment once
/// per period to release amountPerPeriod to the agent.
contract QorbitBilling {
    struct Subscription {
        address subscriber;
        address agent;
        uint256 amountPerPeriod;
        uint256 periodSeconds;
        uint256 lastPaidAt;
        uint256 balance;
        bool active;
    }

    address public admin;
    mapping(bytes32 => Subscription) public subscriptions;

    event SubscriptionCreated(
        bytes32 indexed subId,
        address indexed subscriber,
        address indexed agent,
        uint256 amountPerPeriod,
        uint256 periodSeconds
    );
    event SubscriptionCancelled(bytes32 indexed subId);
    event PaymentProcessed(bytes32 indexed subId, address indexed agent, uint256 amount);
    event ToppedUp(bytes32 indexed subId, uint256 amount);

    error NotSubscriber();
    error NotActive();
    error PeriodNotElapsed();
    error InsufficientBalance();
    error TransferFailed();
    error InvalidParams();

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Create a subscription and deposit initial balance.
    /// Sets lastPaidAt = now - periodSeconds so processPayment is immediately callable.
    function createSubscription(
        address agent,
        uint256 amountPerPeriod,
        uint256 periodSeconds
    ) external payable returns (bytes32 subId) {
        if (agent == address(0) || amountPerPeriod == 0 || periodSeconds == 0) revert InvalidParams();

        subId = keccak256(
            abi.encodePacked(msg.sender, agent, amountPerPeriod, periodSeconds, block.timestamp)
        );

        subscriptions[subId] = Subscription({
            subscriber: msg.sender,
            agent: agent,
            amountPerPeriod: amountPerPeriod,
            periodSeconds: periodSeconds,
            lastPaidAt: block.timestamp - periodSeconds,
            balance: msg.value,
            active: true
        });

        emit SubscriptionCreated(subId, msg.sender, agent, amountPerPeriod, periodSeconds);
    }

    /// @notice Cancel a subscription and refund remaining balance to subscriber.
    function cancelSubscription(bytes32 subId) external {
        Subscription storage sub = subscriptions[subId];
        if (sub.subscriber != msg.sender && msg.sender != admin) revert NotSubscriber();
        if (!sub.active) revert NotActive();
        sub.active = false;
        if (sub.balance > 0) {
            uint256 refund = sub.balance;
            sub.balance = 0;
            (bool ok, ) = sub.subscriber.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
        emit SubscriptionCancelled(subId);
    }

    /// @notice Pay the agent if a full period has elapsed. Callable by anyone (keeper bot).
    function processPayment(bytes32 subId) external {
        Subscription storage sub = subscriptions[subId];
        if (!sub.active) revert NotActive();
        if (block.timestamp < sub.lastPaidAt + sub.periodSeconds) revert PeriodNotElapsed();
        if (sub.balance < sub.amountPerPeriod) revert InsufficientBalance();

        sub.lastPaidAt = block.timestamp;
        sub.balance -= sub.amountPerPeriod;

        (bool ok, ) = sub.agent.call{value: sub.amountPerPeriod}("");
        if (!ok) revert TransferFailed();

        emit PaymentProcessed(subId, sub.agent, sub.amountPerPeriod);
    }

    /// @notice Add more funds to an existing subscription.
    function topUp(bytes32 subId) external payable {
        Subscription storage sub = subscriptions[subId];
        if (sub.subscriber != msg.sender) revert NotSubscriber();
        if (!sub.active) revert NotActive();
        sub.balance += msg.value;
        emit ToppedUp(subId, msg.value);
    }

    function getSubscription(bytes32 subId) external view returns (Subscription memory) {
        return subscriptions[subId];
    }

    function nextPaymentDue(bytes32 subId) external view returns (uint256) {
        Subscription storage sub = subscriptions[subId];
        return sub.lastPaidAt + sub.periodSeconds;
    }

    function isDue(bytes32 subId) external view returns (bool) {
        Subscription storage sub = subscriptions[subId];
        return sub.active && block.timestamp >= sub.lastPaidAt + sub.periodSeconds && sub.balance >= sub.amountPerPeriod;
    }
}
