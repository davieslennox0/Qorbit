// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title QorbitpayRegistry
/// @notice Registry of autonomous agents that can send/receive payments on Qorbitpay.
/// Reputation is a simple bounded score updated by an authorized router contract
/// after each settled payment (positive on release, negative on dispute/refund).
contract QorbitpayRegistry {
    struct Agent {
        address owner;
        string serviceEndpoint; // e.g. https://agent.example.com/x402
        uint32 reputation; // starts at 100, bounded [0, 1000]
        uint64 registeredAt;
        bool active;
    }

    uint32 public constant STARTING_REPUTATION = 100;
    uint32 public constant MAX_REPUTATION = 1000;

    address public admin;
    address public router;

    mapping(address => Agent) public agents;
    address[] public agentList;

    event AgentRegistered(address indexed agent, string serviceEndpoint);
    event AgentEndpointUpdated(address indexed agent, string serviceEndpoint);
    event AgentDeactivated(address indexed agent);
    event ReputationChanged(address indexed agent, int32 delta, uint32 newReputation);
    event RouterUpdated(address indexed router);

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

    /// @notice Register `agent` as a payment receiver. `agent` is the address that
    /// receives funds and is looked up by payers; `msg.sender` becomes the `owner`
    /// allowed to manage the listing (supports both self-registration, where an agent
    /// calls this for itself, and custodial onboarding, where a relayer registers an
    /// agent address on its behalf via an off-chain API).
    function registerAgent(address agent, string calldata serviceEndpoint) external {
        if (agents[agent].registeredAt != 0) revert AlreadyRegistered();
        agents[agent] = Agent({
            owner: msg.sender,
            serviceEndpoint: serviceEndpoint,
            reputation: STARTING_REPUTATION,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        agentList.push(agent);
        emit AgentRegistered(agent, serviceEndpoint);
    }

    function updateEndpoint(address agent, string calldata serviceEndpoint) external {
        if (agents[agent].registeredAt == 0) revert NotRegistered();
        if (agents[agent].owner != msg.sender) revert NotOwner();
        agents[agent].serviceEndpoint = serviceEndpoint;
        emit AgentEndpointUpdated(agent, serviceEndpoint);
    }

    function deactivate(address agent) external {
        if (agents[agent].registeredAt == 0) revert NotRegistered();
        if (agents[agent].owner != msg.sender) revert NotOwner();
        agents[agent].active = false;
        emit AgentDeactivated(agent);
    }

    /// @notice Adjust reputation after a settled payment. Called by the router only.
    function adjustReputation(address agent, int32 delta) external onlyRouter {
        if (agents[agent].registeredAt == 0) revert NotRegistered();
        uint32 current = agents[agent].reputation;
        int256 next = int256(uint256(current)) + int256(delta);
        if (next < 0) next = 0;
        if (next > int256(uint256(MAX_REPUTATION))) next = int256(uint256(MAX_REPUTATION));
        agents[agent].reputation = uint32(uint256(next));
        emit ReputationChanged(agent, delta, agents[agent].reputation);
    }

    function isRegistered(address agent) external view returns (bool) {
        return agents[agent].registeredAt != 0;
    }

    function getAgent(address agent) external view returns (Agent memory) {
        return agents[agent];
    }

    function agentCount() external view returns (uint256) {
        return agentList.length;
    }

    /// @notice Paginated agent discovery for GET /api/agents.
    function listAgents(uint256 offset, uint256 limit) external view returns (Agent[] memory page, address[] memory addrs) {
        uint256 total = agentList.length;
        if (offset >= total) {
            return (new Agent[](0), new address[](0));
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;
        page = new Agent[](n);
        addrs = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = agentList[offset + i];
            addrs[i] = a;
            page[i] = agents[a];
        }
    }
}
