export const ADDRESSES = {
  router:   '0x529D65da046EFA1240093F15cF7B6AfeaA64CFb6',
  billing:  '0xdF87E0c0cfcA0AEa1e899073c36F29Fd865B5e97',
  treasury: '0x7168493186654AD84Ef2dEfb78C773eeCB1BaFC8',
};

// Platform wallet — receives protocol fees
export const PLATFORM_WALLET = '0xf3139029B33fd42BC3adADbc41bBaA11203ACb6E';

// Protocol fee schedule
export const FEES = {
  agentTx:          '0.001',   // USDC per router tx (enforced on-chain)
  fraudCheck:       '0.0005',  // USDC per quantum fraud check
  billingMonthly:   '9.99',    // USDC/month platform subscription for Billing
  treasuryMonthly:  '9.99',    // USDC/month platform subscription for Treasury
};

export const BILLING_ABI = [
  'function createSubscription(address agent, uint256 amountPerPeriod, uint256 periodSeconds) payable returns (bytes32)',
  'function cancelSubscription(bytes32 subId)',
  'function processPayment(bytes32 subId)',
  'function topUp(bytes32 subId) payable',
  'function getSubscription(bytes32 subId) view returns (tuple(address subscriber, address agent, uint256 amountPerPeriod, uint256 periodSeconds, uint256 lastPaidAt, uint256 balance, bool active))',
  'function isDue(bytes32 subId) view returns (bool)',
  'event SubscriptionCreated(bytes32 indexed subId, address indexed subscriber, address indexed agent, uint256 amountPerPeriod, uint256 periodSeconds)',
  'event SubscriptionCancelled(bytes32 indexed subId)',
  'event PaymentProcessed(bytes32 indexed subId, uint256 amount)',
];

export const TREASURY_ABI = [
  'function deposit() payable',
  'function allocateBudget(address workerAgent, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'function spend(address treasury, uint256 amount, uint256 category)',
  'function revokeBudget(address workerAgent)',
  'function getBudget(address treasury, address workerAgent) view returns (uint256 remaining, uint256 dailyCap, uint256 expiresAt, uint256 categoryMask, bool active)',
  'function treasuryBalances(address) view returns (uint256)',
  'event Deposited(address indexed treasury, uint256 amount)',
  'event BudgetAllocated(address indexed treasury, address indexed worker, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)',
  'event BudgetRevoked(address indexed treasury, address indexed worker)',
  'event Spent(address indexed treasury, address indexed worker, uint256 amount, uint256 category)',
];

export const ROUTER_ABI = [
  'function pay(address to, bytes32 memoHash) payable',
  'function splitPay(address[] to, uint256[] amounts, bytes32 memoHash) payable',
  'function createEscrow(address payee, uint64 timeoutSeconds) payable returns (uint256)',
  'function releaseEscrow(uint256 id)',
  'function refundEscrow(uint256 id)',
  'function platformFee() view returns (uint256)',
];
