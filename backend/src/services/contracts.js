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

const REGISTRY_ABI = [
  'function registerAgent(address agent, string serviceEndpoint)',
  'function updateEndpoint(address agent, string serviceEndpoint)',
  'function isRegistered(address agent) view returns (bool)',
  'function getAgent(address agent) view returns (tuple(address owner,string serviceEndpoint,uint32 reputation,uint64 registeredAt,bool active))',
  'function agentCount() view returns (uint256)',
  'function listAgents(uint256 offset, uint256 limit) view returns (tuple(address owner,string serviceEndpoint,uint32 reputation,uint64 registeredAt,bool active)[] page, address[] addrs)',
];

const VERIFIER_ABI = [
  'function registerPublicKey(bytes32 pubKeyHash)',
  'function attestSignature(bytes32 messageHash, bytes32 pubKeyHash, bool valid)',
  'function isValidSignature(bytes32 messageHash) view returns (bool)',
  'function getAttestation(bytes32 messageHash) view returns (tuple(bytes32 pubKeyHash,bool valid,address attestor,uint64 attestedAt))',
  'function registeredPubKeyHash(address agent) view returns (bytes32)',
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

export { routerContract, registryContract, verifierContract };
