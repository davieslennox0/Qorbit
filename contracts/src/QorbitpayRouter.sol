// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {QorbitpayRegistry} from "./QorbitpayRegistry.sol";

/// @title QorbitpayRouter
/// @notice Routes native-token (USDC gas token on Arc) payments between agents:
/// direct payments, multi-recipient splits, and escrow with release/refund.
/// Also anchors SHA-256 batch commitments of QRNG-derived payment nonces on-chain.
/// A flat platformFee (default 0.001 USDC) is deducted on every payment and sent
/// to feeRecipient (the Qorbitpay protocol treasury).
contract QorbitpayRouter {
    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        uint64 createdAt;
        uint64 timeoutSeconds;
        bool released;
        bool refunded;
    }

    address public admin;
    address public anchor;
    address public feeRecipient;
    QorbitpayRegistry public registry;

    uint256 public platformFee = 0.001 ether; // 0.001 USDC per transaction

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event PaymentSent(address indexed from, address indexed to, uint256 amount, bytes32 memoHash);
    event SplitPaymentSent(address indexed from, address[] to, uint256[] amounts, bytes32 memoHash);
    event EscrowCreated(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, uint64 timeoutSeconds);
    event EscrowReleased(uint256 indexed id);
    event EscrowRefunded(uint256 indexed id);
    event BatchAnchored(bytes32 indexed merkleRoot, uint256 batchSize, uint256 timestamp);
    event AnchorUpdated(address indexed anchor);
    event RegistryUpdated(address indexed registry);
    event PlatformFeeUpdated(uint256 fee);
    event FeeRecipientUpdated(address recipient);

    error NotAdmin();
    error NotAnchor();
    error LengthMismatch();
    error AmountMismatch();
    error InsufficientForFee();
    error EscrowNotFound();
    error EscrowAlreadySettled();
    error NotEscrowParty();
    error EscrowNotExpired();
    error TransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAnchor() {
        if (msg.sender != anchor) revert NotAnchor();
        _;
    }

    constructor(address registryAddress) {
        admin = msg.sender;
        anchor = msg.sender;
        feeRecipient = msg.sender;
        registry = QorbitpayRegistry(registryAddress);
    }

    function setAnchor(address _anchor) external onlyAdmin {
        anchor = _anchor;
        emit AnchorUpdated(_anchor);
    }

    function setRegistry(address registryAddress) external onlyAdmin {
        registry = QorbitpayRegistry(registryAddress);
        emit RegistryUpdated(registryAddress);
    }

    function setPlatformFee(uint256 fee) external onlyAdmin {
        platformFee = fee;
        emit PlatformFeeUpdated(fee);
    }

    function setFeeRecipient(address recipient) external onlyAdmin {
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    /// @notice Direct payment. msg.value must exceed platformFee; net amount goes to `to`.
    function pay(address to, bytes32 memoHash) external payable {
        if (msg.value <= platformFee) revert InsufficientForFee();
        _send(feeRecipient, platformFee);
        uint256 net = msg.value - platformFee;
        _send(to, net);
        emit PaymentSent(msg.sender, to, net, memoHash);
    }

    /// @notice Multi-recipient split. msg.value must equal sum(amounts) + platformFee.
    function splitPay(address[] calldata to, uint256[] calldata amounts, bytes32 memoHash) external payable {
        if (to.length != amounts.length) revert LengthMismatch();
        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        if (msg.value != total + platformFee) revert AmountMismatch();
        _send(feeRecipient, platformFee);
        for (uint256 i = 0; i < to.length; i++) {
            _send(to[i], amounts[i]);
        }
        emit SplitPaymentSent(msg.sender, to, amounts, memoHash);
    }

    /// @notice Escrow creation. msg.value must exceed platformFee; net is held in escrow.
    function createEscrow(address payee, uint64 timeoutSeconds) external payable returns (uint256 id) {
        if (msg.value <= platformFee) revert InsufficientForFee();
        _send(feeRecipient, platformFee);
        uint256 net = msg.value - platformFee;
        id = escrowCount++;
        escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            amount: net,
            createdAt: uint64(block.timestamp),
            timeoutSeconds: timeoutSeconds,
            released: false,
            refunded: false
        });
        emit EscrowCreated(id, msg.sender, payee, net, timeoutSeconds);
    }

    function releaseEscrow(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.payer == address(0)) revert EscrowNotFound();
        if (e.released || e.refunded) revert EscrowAlreadySettled();
        if (msg.sender != e.payer && msg.sender != admin) revert NotEscrowParty();
        e.released = true;
        _send(e.payee, e.amount);
        if (address(registry) != address(0) && registry.isRegistered(e.payee)) {
            registry.adjustReputation(e.payee, 5);
        }
        emit EscrowReleased(id);
    }

    function refundEscrow(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.payer == address(0)) revert EscrowNotFound();
        if (e.released || e.refunded) revert EscrowAlreadySettled();
        bool expired = block.timestamp >= e.createdAt + e.timeoutSeconds;
        if (msg.sender == admin) {
            // arbiter can refund any time
        } else if (msg.sender == e.payer) {
            if (!expired) revert EscrowNotExpired();
        } else {
            revert NotEscrowParty();
        }
        e.refunded = true;
        _send(e.payer, e.amount);
        emit EscrowRefunded(id);
    }

    function anchorBatch(bytes32 merkleRoot, uint256 batchSize) external onlyAnchor {
        emit BatchAnchored(merkleRoot, batchSize, block.timestamp);
    }

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return escrows[id];
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
