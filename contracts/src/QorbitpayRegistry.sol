// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IERC8004
/// @notice Emerging standard for autonomous agent identity on EVM chains.
interface IERC8004 {
    struct AgentIdentity {
        address owner;
        string name;
        string version;
        string serviceEndpoint;
        bytes32 capabilityHash;
        uint256 registeredAt;
        bool active;
    }

    function registerAgent(AgentIdentity calldata identity) external returns (bytes32 agentId);
    function getAgent(bytes32 agentId) external view returns (AgentIdentity memory);
    function validateAgent(bytes32 agentId) external view returns (bool);
    function deactivateAgent(bytes32 agentId) external;

    event AgentRegistered(bytes32 indexed agentId, address indexed owner, string name);
    event AgentValidated(bytes32 indexed agentId);
    event AgentDeactivated(bytes32 indexed agentId);
}

/// @title QorbitpayRegistry
/// @notice ERC-8004 compliant agent identity registry with Qorbitpay reputation and
/// quantum-layer extensions. Agents are identified by a unique bytes32 agentId derived
/// from their owner address, name, and registration timestamp.
contract QorbitpayRegistry is IERC8004 {
    /// @notice Full agent record: ERC-8004 identity fields plus Qorbitpay extensions.
    struct AgentRecord {
        // ERC-8004 required fields
        address owner;
        string name;
        string version;
        string serviceEndpoint;
        bytes32 capabilityHash;
        uint256 registeredAt;
        bool active;
        // Qorbitpay extensions
        uint32 reputation;           // starts at 100, bounded [0, 1000]
        bytes32 dilithiumPubKeyHash; // ML-DSA-44 (Dilithium2) public key hash
        uint32 trustScore;           // VQC fraud-engine trust score [0, 100]
        uint8 quantumLayerMask;      // QAOA=0x01, VQC=0x02, QRNG=0x04, Dilithium=0x08
    }

    uint32 public constant STARTING_REPUTATION = 100;
    uint32 public constant MAX_REPUTATION = 1000;

    // Quantum layer bitmask constants
    uint8 public constant LAYER_QAOA      = 0x01;
    uint8 public constant LAYER_VQC       = 0x02;
    uint8 public constant LAYER_QRNG      = 0x04;
    uint8 public constant LAYER_DILITHIUM = 0x08;
    uint8 public constant LAYER_ALL       = 0x0F;

    address public admin;
    address public router;

    mapping(bytes32 => AgentRecord) internal _agents;
    mapping(address => bytes32) public ownerToAgentId;
    bytes32[] public agentList;

    // Qorbitpay extension events
    event AgentEndpointUpdated(bytes32 indexed agentId, string serviceEndpoint);
    event ReputationChanged(bytes32 indexed agentId, int32 delta, uint32 newReputation);
    event TrustScoreUpdated(bytes32 indexed agentId, uint32 trustScore);
    event DilithiumKeySet(bytes32 indexed agentId, bytes32 pubKeyHash);
    event RouterUpdated(address indexed newRouter);

    error NotAdmin();
    error NotRouter();
    error NotOwner();
    error AlreadyRegistered();
    error NotRegistered();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyRouter() {
        if (msg.sender != router) revert NotRouter();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setRouter(address _router) external onlyAdmin {
        router = _router;
        emit RouterUpdated(_router);
    }

    // ─── ERC-8004 required functions ────────────────────────────────────────────

    /// @notice Register an agent using an ERC-8004 AgentIdentity struct. Returns a unique
    /// bytes32 agentId derived from owner, name, and block.timestamp. `identity.registeredAt`
    /// is ignored — the contract stamps block.timestamp; `identity.active` is always set true.
    function registerAgent(AgentIdentity calldata identity) external override returns (bytes32 agentId) {
        if (ownerToAgentId[identity.owner] != bytes32(0)) revert AlreadyRegistered();

        agentId = keccak256(abi.encodePacked(identity.owner, identity.name, block.timestamp));

        _agents[agentId] = AgentRecord({
            owner: identity.owner,
            name: identity.name,
            version: identity.version,
            serviceEndpoint: identity.serviceEndpoint,
            capabilityHash: identity.capabilityHash,
            registeredAt: block.timestamp,
            active: true,
            reputation: STARTING_REPUTATION,
            dilithiumPubKeyHash: bytes32(0),
            trustScore: 100,
            quantumLayerMask: LAYER_ALL
        });

        ownerToAgentId[identity.owner] = agentId;
        agentList.push(agentId);

        emit AgentRegistered(agentId, identity.owner, identity.name);
        emit AgentValidated(agentId);
    }

    /// @notice ERC-8004: Returns the core identity fields for an agent by its agentId.
    function getAgent(bytes32 agentId) external view override returns (AgentIdentity memory) {
        AgentRecord storage r = _agents[agentId];
        return AgentIdentity({
            owner: r.owner,
            name: r.name,
            version: r.version,
            serviceEndpoint: r.serviceEndpoint,
            capabilityHash: r.capabilityHash,
            registeredAt: r.registeredAt,
            active: r.active
        });
    }

    /// @notice ERC-8004: Returns true if the agent is registered and currently active.
    function validateAgent(bytes32 agentId) external view override returns (bool) {
        AgentRecord storage r = _agents[agentId];
        return r.registeredAt != 0 && r.active;
    }

    /// @notice ERC-8004: Deactivate an agent. Only callable by the agent's owner.
    function deactivateAgent(bytes32 agentId) external override {
        AgentRecord storage r = _agents[agentId];
        if (r.registeredAt == 0) revert NotRegistered();
        if (r.owner != msg.sender) revert NotOwner();
        r.active = false;
        emit AgentDeactivated(agentId);
    }

    // ─── Qorbitpay extensions ───────────────────────────────────────────────────

    /// @notice Returns the full agent record including Qorbitpay extension fields.
    function getAgentRecord(bytes32 agentId) external view returns (AgentRecord memory) {
        return _agents[agentId];
    }

    /// @notice Look up an agent by owner address. Returns both the agentId and the full
    /// extended record. Returns (bytes32(0), empty record) if not registered.
    function getAgentByOwner(address owner) external view returns (bytes32 agentId, AgentRecord memory record) {
        agentId = ownerToAgentId[owner];
        record = _agents[agentId];
    }

    /// @notice Update the service endpoint for an agent (owner only).
    function updateEndpoint(bytes32 agentId, string calldata serviceEndpoint) external {
        AgentRecord storage r = _agents[agentId];
        if (r.registeredAt == 0) revert NotRegistered();
        if (r.owner != msg.sender) revert NotOwner();
        r.serviceEndpoint = serviceEndpoint;
        emit AgentEndpointUpdated(agentId, serviceEndpoint);
    }

    /// @notice Store the agent's Dilithium (ML-DSA-44) public key hash on-chain (owner only).
    function setDilithiumPubKey(bytes32 agentId, bytes32 pubKeyHash) external {
        AgentRecord storage r = _agents[agentId];
        if (r.registeredAt == 0) revert NotRegistered();
        if (r.owner != msg.sender) revert NotOwner();
        r.dilithiumPubKeyHash = pubKeyHash;
        emit DilithiumKeySet(agentId, pubKeyHash);
    }

    /// @notice Adjust reputation after a settled payment. Called by the router only.
    /// Accepts the agent's owner address for backward compatibility with QorbitpayRouter.
    function adjustReputation(address agentOwner, int32 delta) external onlyRouter {
        bytes32 agentId = ownerToAgentId[agentOwner];
        if (agentId == bytes32(0)) revert NotRegistered();
        AgentRecord storage r = _agents[agentId];
        uint32 current = r.reputation;
        int256 next = int256(uint256(current)) + int256(delta);
        if (next < 0) next = 0;
        if (next > int256(uint256(MAX_REPUTATION))) next = int256(uint256(MAX_REPUTATION));
        r.reputation = uint32(uint256(next));
        emit ReputationChanged(agentId, delta, r.reputation);
    }

    /// @notice Update the VQC-derived trust score for an agent. Called by the router only.
    function updateTrustScore(bytes32 agentId, uint32 trustScore) external onlyRouter {
        AgentRecord storage r = _agents[agentId];
        if (r.registeredAt == 0) revert NotRegistered();
        if (trustScore > 100) trustScore = 100;
        r.trustScore = trustScore;
        emit TrustScoreUpdated(agentId, trustScore);
    }

    /// @notice Returns true if the given owner address has a registered agent.
    /// Kept for backward compatibility with QorbitpayRouter.
    function isRegistered(address agentOwner) external view returns (bool) {
        return ownerToAgentId[agentOwner] != bytes32(0);
    }

    function agentCount() external view returns (uint256) {
        return agentList.length;
    }

    /// @notice Paginated agent discovery returning full extended records and their agentIds.
    function listAgents(uint256 offset, uint256 limit)
        external
        view
        returns (AgentRecord[] memory page, bytes32[] memory ids)
    {
        uint256 total = agentList.length;
        if (offset >= total) {
            return (new AgentRecord[](0), new bytes32[](0));
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;
        page = new AgentRecord[](n);
        ids = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = agentList[offset + i];
            ids[i] = id;
            page[i] = _agents[id];
        }
    }
}
