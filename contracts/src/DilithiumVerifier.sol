// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title DilithiumVerifier
/// @notice On-chain attestation registry for post-quantum (ML-DSA / Dilithium, FIPS 204)
/// signatures used to authorize Qorbitpay payments.
///
/// IMPORTANT ARCHITECTURE NOTE: ML-DSA verification requires polynomial arithmetic over
/// a degree-256 ring mod q=8380417 (NTT, rejection sampling, hint-bit checks). That is not
/// feasible to execute correctly or affordably inside the EVM today (no production system
/// verifies lattice-based PQC signatures natively on-chain; this would need a precompile or
/// a zk-SNARK proof of the verification circuit, neither of which exists on Arc). The
/// standard real-world pattern - used here - is: verify the signature off-chain with an
/// audited ML-DSA implementation, then have an authorized attestor publish the verification
/// result on-chain as a tamper-evident, replay-protected commitment. This contract is the
/// on-chain half of that pattern, with public key byte-length constants for the ML-DSA-44
/// (Dilithium2) parameter set used to sanity-check off-chain inputs before attestation.
contract DilithiumVerifier {
    // ML-DSA-44 (Dilithium2) FIPS 204 byte sizes.
    uint256 public constant PUBLIC_KEY_BYTES = 1312;
    uint256 public constant SIGNATURE_BYTES = 2420;

    struct Attestation {
        bytes32 pubKeyHash; // keccak256 of the ML-DSA public key
        bool valid; // result of the off-chain ML-DSA verification
        address attestor;
        uint64 attestedAt;
    }

    address public admin;
    mapping(address => bool) public attestors; // backend services authorized to attest
    mapping(address => bytes32) public registeredPubKeyHash; // agent => keccak256(pubkey)
    mapping(bytes32 => Attestation) public attestations; // messageHash => attestation

    event AttestorUpdated(address indexed attestor, bool allowed);
    event PublicKeyRegistered(address indexed agent, bytes32 pubKeyHash);
    event SignatureAttested(bytes32 indexed messageHash, bytes32 indexed pubKeyHash, bool valid, address attestor);

    error NotAdmin();
    error NotAttestor();
    error AlreadyAttested();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAttestor() {
        if (!attestors[msg.sender]) revert NotAttestor();
        _;
    }

    constructor() {
        admin = msg.sender;
        attestors[msg.sender] = true;
    }

    function setAttestor(address attestor, bool allowed) external onlyAdmin {
        attestors[attestor] = allowed;
        emit AttestorUpdated(attestor, allowed);
    }

    /// @notice Agent registers the keccak256 hash of its ML-DSA public key.
    function registerPublicKey(bytes32 pubKeyHash) external {
        registeredPubKeyHash[msg.sender] = pubKeyHash;
        emit PublicKeyRegistered(msg.sender, pubKeyHash);
    }

    /// @notice Publish the result of an off-chain ML-DSA signature verification.
    /// `messageHash` is keccak256 of the signed payload (e.g. a payment authorization);
    /// replay-protected so each message can only be attested once.
    function attestSignature(bytes32 messageHash, bytes32 pubKeyHash, bool valid) external onlyAttestor {
        if (attestations[messageHash].attestedAt != 0) revert AlreadyAttested();
        attestations[messageHash] = Attestation({
            pubKeyHash: pubKeyHash,
            valid: valid,
            attestor: msg.sender,
            attestedAt: uint64(block.timestamp)
        });
        emit SignatureAttested(messageHash, pubKeyHash, valid, msg.sender);
    }

    function isValidSignature(bytes32 messageHash) external view returns (bool) {
        return attestations[messageHash].valid;
    }

    function getAttestation(bytes32 messageHash) external view returns (Attestation memory) {
        return attestations[messageHash];
    }
}
