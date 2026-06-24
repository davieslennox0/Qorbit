export const ROUTER_ABI = [
  'function pay(address to, bytes32 memoHash) payable',
  'function splitPay(address[] to, uint256[] amounts, bytes32 memoHash) payable',
  'function createEscrow(address payee, uint64 timeoutSeconds) payable returns (uint256)',
  'function releaseEscrow(uint256 id)',
  'function refundEscrow(uint256 id)',
  'function getEscrow(uint256 id) view returns (tuple(address payer,address payee,uint256 amount,uint64 createdAt,uint64 timeoutSeconds,bool released,bool refunded))',
  'event PaymentSent(address indexed from, address indexed to, uint256 amount, bytes32 memoHash)',
];

export const REGISTRY_ABI = [
  'function registerAgent(address agent, string serviceEndpoint)',
  'function updateEndpoint(address agent, string serviceEndpoint)',
  'function isRegistered(address agent) view returns (bool)',
  'function getAgent(address agent) view returns (tuple(address owner,string serviceEndpoint,uint32 reputation,uint64 registeredAt,bool active))',
  'function agentCount() view returns (uint256)',
  'function listAgents(uint256 offset, uint256 limit) view returns (tuple(address owner,string serviceEndpoint,uint32 reputation,uint64 registeredAt,bool active)[] page, address[] addrs)',
];
