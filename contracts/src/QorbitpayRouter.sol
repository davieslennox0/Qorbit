// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {QorbitpayRegistry} from "./QorbitpayRegistry.sol";

/// @title QorbitpayRouter
/// @notice Routes native-token (USDC gas token on Arc) payments between agents:
/// direct payments, multi-recipient splits, and escrow with release/refund.
/// Also anchors SHA-256 batch commitments of QRNG-derived payment nonces on-chain.
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
    address public anchor; // backend service address allowed to anchor nonce batches
    QorbitpayRegistry public registry;

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

    error NotAdmin();
    error NotAnchor();
    error LengthMismatch();
    error AmountMismatch();
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

    /// @notice Direct payment from caller to `to`. `memoHash` ties the payment to an
    /// off-chain record (e.g. hash of the x402 payment payload or quantum nonce).
    function pay(address to, bytes32 memoHash) external payable {
        _send(to, msg.value);
        emit PaymentSent(msg.sender, to, msg.value, memoHash);
    }

    /// @notice Multi-hop / multi-recipient split payment. Sum of amounts must equal msg.value.
    function splitPay(address[] calldata to, uint256[] calldata amounts, bytes32 memoHash) external payable {
        if (to.length != amounts.length) revert LengthMismatch();
        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        if (total != msg.value) revert AmountMismatch();
        for (uint256 i = 0; i < to.length; i++) {
            _send(to[i], amounts[i]);
        }
        emit SplitPaymentSent(msg.sender, to, amounts, memoHash);
    }

    function createEscrow(address payee, uint64 timeoutSeconds) external payable returns (uint256 id) {
        id = escrowCount++;
        escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            amount: msg.value,
            createdAt: uint64(block.timestamp),
            timeoutSeconds: timeoutSeconds,
            released: false,
            refunded: false
        });
        emit EscrowCreated(id, msg.sender, payee, msg.value, timeoutSeconds);
    }

    /// @notice Release escrowed funds to the payee. Callable by the payer (early release)
    /// or the admin (arbiter). Bumps payee reputation if a registry is set.
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

    /// @notice Refund escrowed funds to the payer. Callable by the payer after timeout,
    /// or the admin (arbiter) at any time.
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

    /// @notice Anchor a SHA-256 Merkle root committing to a batch of QRNG payment nonces.
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
