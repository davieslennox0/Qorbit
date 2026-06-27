import { ethers } from 'ethers';
import { provider } from './arc-chain.js';

const ROUTER_ABI = [
  'function pay(address to, bytes32 memoHash) payable',
  'function splitPay(address[] to, uint256[] amounts, bytes32 memoHash) payable',
  'function createEscrow(address payee, uint64 timeoutSeconds) payable returns (uint256)',
  'function releaseEscrow(uint256 id)',
  'function refundEscrow(uint256 id)',
  'function anchorBatch(bytes32 merkleRoot, uint256 batchSize)',
  'function getEscrow(uint256 id) view returns (tuple(address payer,address payee,uint256 amount,uint64 createdAt,uint64 timeoutSeconds,bool released,bool refunded))',
  'event PaymentSent(address indexed from, address indexed to, uint256 amount, bytes32 memoHash)',
  'event BatchAnchored(bytes32 indexed merkleRoot, uint256 batchSize, uint256 timestamp)',
];

const AGENT_IDENTITY_TUPLE = 'tuple(address owner,string name,string version,string serviceEndpoint,bytes32 capabilityHash,uint256 registeredAt,bool active)';
const AGENT_RECORD_TUPLE = 'tuple(address owner,string name,string version,string serviceEndpoint,bytes32 capabilityHash,uint256 registeredAt,bool active,uint32 reputation,bytes32 dilithiumPubKeyHash,uint32 trustScore,uint8 quantumLayerMask)';

const REGISTRY_ABI = [
  // ERC-8004 required
  `function registerAgent(${AGENT_IDENTITY_TUPLE} identity) returns (bytes32 agentId)`,
  `function getAgent(bytes32 agentId) view returns (${AGENT_IDENTITY_TUPLE})`,
  'function validateAgent(bytes32 agentId) view returns (bool)',
  'function deactivateAgent(bytes32 agentId)',
  'event AgentRegistered(bytes32 indexed agentId, address indexed owner, string name)',
  'event AgentValidated(bytes32 indexed agentId)',
  'event AgentDeactivated(bytes32 indexed agentId)',
  // Qorbitpay extensions
  `function getAgentRecord(bytes32 agentId) view returns (${AGENT_RECORD_TUPLE})`,
  `function getAgentByOwner(address owner) view returns (bytes32 agentId, ${AGENT_RECORD_TUPLE} record)`,
  'function updateEndpoint(bytes32 agentId, string serviceEndpoint)',
  'function setDilithiumPubKey(bytes32 agentId, bytes32 pubKeyHash)',
  'function isRegistered(address agentOwner) view returns (bool)',
  'function ownerToAgentId(address) view returns (bytes32)',
  'function agentCount() view returns (uint256)',
  `function listAgents(uint256 offset, uint256 limit) view returns (${AGENT_RECORD_TUPLE}[] page, bytes32[] ids)`,
];

const VERIFIER_ABI = [
  'function registerPublicKey(bytes32 pubKeyHash)',
  'function attestSignature(bytes32 messageHash, bytes32 pubKeyHash, bool valid)',
  'function isValidSignature(bytes32 messageHash) view returns (bool)',
  'function getAttestation(bytes32 messageHash) view returns (tuple(bytes32 pubKeyHash,bool valid,address attestor,uint64 attestedAt))',
  'function registeredPubKeyHash(address agent) view returns (bytes32)',
];

const BILLING_ABI = [
  'function createSubscription(address agent, uint256 amountPerPeriod, uint256 periodSeconds) payable returns (bytes32)',
  'function cancelSubscription(bytes32 subId)',
  'function processPayment(bytes32 subId)',
  'function topUp(bytes32 subId) payable',
  'function getSubscription(bytes32 subId) view returns (tuple(address subscriber,address agent,uint256 amountPerPeriod,uint256 periodSeconds,uint256 lastPaidAt,uint256 balance,bool active))',
  'function nextPaymentDue(bytes32 subId) view returns (uint256)',
  'function isDue(bytes32 subId) view returns (bool)',
  'event SubscriptionCreated(bytes32 indexed subId, address indexed subscriber, address indexed agent, uint256 amountPerPeriod, uint256 periodSeconds)',
  'event SubscriptionCancelled(bytes32 indexed subId)',
  'event PaymentProcessed(bytes32 indexed subId, address indexed agent, uint256 amount)',
];

const TREASURY_ABI = [
  'function deposit() payable',
  'function depositFor(address treasury) payable',
  'function allocateBudget(address workerAgent, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'function allocateBudgetFor(address treasury, address workerAgent, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'function spend(address treasury, uint256 amount, uint256 category)',
  'function spendFor(address treasury, address worker, uint256 amount, uint256 category)',
  'function revokeBudget(address workerAgent)',
  'function revokeBudgetFor(address treasury, address workerAgent)',
  'function getBudget(address treasury, address workerAgent) view returns (uint256 remaining, uint256 dailyCap, uint256 expiresAt, uint256 categoryMask, bool active)',
  'function treasuryBalances(address) view returns (uint256)',
  'event BudgetAllocated(address indexed treasury, address indexed worker, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'event BudgetRevoked(address indexed treasury, address indexed worker)',
  'event SpendExecuted(address indexed treasury, address indexed worker, uint256 amount, uint256 category)',
];

function routerContract(signerOrProvider = provider) {
  return new ethers.Contract(process.env.ROUTER_ADDRESS, ROUTER_ABI, signerOrProvider);
}

function registryContract(signerOrProvider = provider) {
  return new ethers.Contract(process.env.REGISTRY_ADDRESS, REGISTRY_ABI, signerOrProvider);
}

function verifierContract(signerOrProvider = provider) {
  return new ethers.Contract(process.env.DILITHIUM_VERIFIER_ADDRESS, VERIFIER_ABI, signerOrProvider);
}

function billingContract(signerOrProvider = provider) {
  return new ethers.Contract(process.env.BILLING_ADDRESS, BILLING_ABI, signerOrProvider);
}

function treasuryContract(signerOrProvider = provider) {
  return new ethers.Contract(process.env.TREASURY_ADDRESS, TREASURY_ABI, signerOrProvider);
}

export { routerContract, registryContract, verifierContract, billingContract, treasuryContract };
