export const ROUTER_ABI = [
  'function pay(address to, bytes32 memoHash) payable',
  'function splitPay(address[] to, uint256[] amounts, bytes32 memoHash) payable',
  'function createEscrow(address payee, uint64 timeoutSeconds) payable returns (uint256)',
  'function releaseEscrow(uint256 id)',
  'function refundEscrow(uint256 id)',
  'function getEscrow(uint256 id) view returns (tuple(address payer,address payee,uint256 amount,uint64 createdAt,uint64 timeoutSeconds,bool released,bool refunded))',
  'event PaymentSent(address indexed from, address indexed to, uint256 amount, bytes32 memoHash)',
];

const _IDENTITY = 'tuple(address owner,string name,string version,string serviceEndpoint,bytes32 capabilityHash,uint256 registeredAt,bool active)';
const _RECORD = 'tuple(address owner,string name,string version,string serviceEndpoint,bytes32 capabilityHash,uint256 registeredAt,bool active,uint32 reputation,bytes32 dilithiumPubKeyHash,uint32 trustScore,uint8 quantumLayerMask)';

export const REGISTRY_ABI = [
  // ERC-8004 required
  `function registerAgent(${_IDENTITY} identity) returns (bytes32 agentId)`,
  `function getAgent(bytes32 agentId) view returns (${_IDENTITY})`,
  'function validateAgent(bytes32 agentId) view returns (bool)',
  'function deactivateAgent(bytes32 agentId)',
  'event AgentRegistered(bytes32 indexed agentId, address indexed owner, string name)',
  'event AgentValidated(bytes32 indexed agentId)',
  'event AgentDeactivated(bytes32 indexed agentId)',
  // Qorbitpay extensions
  `function getAgentRecord(bytes32 agentId) view returns (${_RECORD})`,
  `function getAgentByOwner(address owner) view returns (bytes32 agentId, ${_RECORD} record)`,
  'function updateEndpoint(bytes32 agentId, string serviceEndpoint)',
  'function setDilithiumPubKey(bytes32 agentId, bytes32 pubKeyHash)',
  'function isRegistered(address agentOwner) view returns (bool)',
  'function ownerToAgentId(address) view returns (bytes32)',
  'function agentCount() view returns (uint256)',
  `function listAgents(uint256 offset, uint256 limit) view returns (${_RECORD}[] page, bytes32[] ids)`,
];

export const BILLING_ABI = [
  'function createSubscription(address agent, uint256 amountPerPeriod, uint256 periodSeconds) payable returns (bytes32)',
  'function cancelSubscription(bytes32 subId)',
  'function processPayment(bytes32 subId)',
  'function topUp(bytes32 subId) payable',
  'function getSubscription(bytes32 subId) view returns (tuple(address subscriber,address agent,uint256 amountPerPeriod,uint256 periodSeconds,uint256 lastPaidAt,uint256 balance,bool active))',
  'function nextPaymentDue(bytes32 subId) view returns (uint256)',
  'function isDue(bytes32 subId) view returns (bool)',
  'event SubscriptionCreated(bytes32 indexed subId, address indexed subscriber, address indexed agent, uint256 amountPerPeriod, uint256 periodSeconds)',
  'event PaymentProcessed(bytes32 indexed subId, address indexed agent, uint256 amount)',
];

export const TREASURY_ABI = [
  'function deposit() payable',
  'function allocateBudget(address workerAgent, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'function spend(address treasury, uint256 amount, uint256 category)',
  'function revokeBudget(address workerAgent)',
  'function getBudget(address treasury, address workerAgent) view returns (uint256 remaining, uint256 dailyCap, uint256 expiresAt, uint256 categoryMask, bool active)',
  'function treasuryBalances(address) view returns (uint256)',
  'event BudgetAllocated(address indexed treasury, address indexed worker, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'event SpendExecuted(address indexed treasury, address indexed worker, uint256 amount, uint256 category)',
];
