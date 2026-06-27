import { ethers } from 'ethers';
import { ROUTER_ABI, REGISTRY_ABI, BILLING_ABI, TREASURY_ABI } from './abi.js';
import { DEFAULT_NETWORK, CATEGORY } from './config.js';

/// Qorbitpay SDK - a thin client for AI agents to send/receive payments directly on Arc,
/// using the agent's own funded wallet (self-sovereign), rather than going through
/// Qorbitpay's custodial backend relayer. The relayer's extra protections (QRNG-anchored
/// nonces, VQC fraud screening, QAOA routing, Dilithium dual-signing/attestation) are
/// features of the hosted POST /api/pay endpoint, not requirements of the on-chain
/// protocol itself - calling the contracts directly here is a fully valid, lighter-weight
/// way to use Qorbitpay. checkFraud()/findRoute() below call the hosted quantum services
/// over HTTP for agents that want those signals without running Qiskit themselves.
class Qorbitpay {
  constructor({
    privateKey,
    rpcUrl = DEFAULT_NETWORK.rpcUrl,
    chainId = DEFAULT_NETWORK.chainId,
    routerAddress = DEFAULT_NETWORK.routerAddress,
    registryAddress = DEFAULT_NETWORK.registryAddress,
    billingAddress = DEFAULT_NETWORK.billingAddress,
    treasuryAddress = DEFAULT_NETWORK.treasuryAddress,
    apiUrl = null,
  } = {}) {
    if (!privateKey) throw new Error('Qorbitpay SDK requires a privateKey');

    this.provider = new ethers.JsonRpcProvider(rpcUrl, { chainId, name: 'arc-testnet' });
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
    this.apiUrl = apiUrl;
    this.explorer = DEFAULT_NETWORK.explorer;

    this.router = new ethers.Contract(routerAddress, ROUTER_ABI, this.wallet);
    this.registry = new ethers.Contract(registryAddress, REGISTRY_ABI, this.wallet);
    this.billing = new ethers.Contract(billingAddress, BILLING_ABI, this.wallet);
    this.treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, this.wallet);

    // ERC-8004 agentId, populated after register() or set manually.
    this.agentId = null;

    // Guards against nonce races if an agent fires multiple calls without awaiting each one.
    this._sendQueue = Promise.resolve();
  }

  _withNonceLock(fn) {
    const run = this._sendQueue.then(async () => {
      const nonce = await this.provider.getTransactionCount(this.address, 'pending');
      return fn(nonce);
    });
    this._sendQueue = run.then(() => {}, () => {});
    return run;
  }

  /// Sends a native-token (USDC) payment to `to` via QorbitpayRouter.pay(). `memo` is
  /// hashed (keccak256) on-chain as an opaque reference - pass the same memo string
  /// elsewhere if you need to look the payment back up.
  async pay({ to, amount, memo } = {}) {
    if (!to || !ethers.isAddress(to)) throw new Error('pay() requires a valid `to` address');
    if (!amount || Number(amount) <= 0) throw new Error('pay() requires a positive `amount`');

    const memoHash = memo ? ethers.keccak256(ethers.toUtf8Bytes(memo)) : ethers.ZeroHash;
    // Router deducts 0.001 USDC platformFee and forwards the remainder to `to`.
    // msg.value must be amount + fee so the recipient gets exactly `amount`.
    const PLATFORM_FEE = ethers.parseEther('0.001');
    const value = ethers.parseEther(String(amount)) + PLATFORM_FEE;

    const tx = await this._withNonceLock((nonce) => this.router.pay(to, memoHash, { value, nonce }));
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      from: this.address,
      to,
      amount: String(amount),
      memo: memo || null,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      blockNumber: receipt.blockNumber,
      explorerUrl: `${this.explorer}/tx/${tx.hash}`,
    };
  }

  /// Subscribes to incoming payments (PaymentSent events where `to` is this agent's
  /// address). Returns an unsubscribe function.
  receive({ onPayment } = {}) {
    if (typeof onPayment !== 'function') throw new Error('receive() requires an onPayment callback');

    const filter = this.router.filters.PaymentSent(null, this.address);
    // Subscribing with a TopicFilter object (rather than the bare event name string)
    // means ethers does NOT expand decoded args into separate listener parameters - it
    // passes a single ContractEventPayload. Assuming the (from, to, amount, memoHash,
    // event) signature here silently threw inside the listener (event was undefined) and
    // ethers swallowed it, which looked exactly like a polling/timing bug until logging
    // the raw listener arguments showed only one object was ever passed.
    const listener = (payload) => {
      const [from, to, amount, memoHash] = payload.args;
      onPayment({
        from,
        to,
        amount: ethers.formatEther(amount),
        memoHash,
        txHash: payload.log.transactionHash,
        blockNumber: payload.log.blockNumber,
        explorerUrl: `${this.explorer}/tx/${payload.log.transactionHash}`,
      });
    };

    this.router.on(filter, listener);
    return () => this.router.off(filter, listener);
  }

  /// Registers this agent in QorbitpayRegistry using an ERC-8004 AgentIdentity struct
  /// (self-sovereign — owner is this wallet). Returns the bytes32 agentId and stores it
  /// on this instance for automatic inclusion as X-Agent-Id in all subsequent API calls.
  /// For custodial registration on an agent's behalf, see the backend's POST /api/receive.
  async register({ name, serviceEndpoint, version = '1.0.0', capabilityHash } = {}) {
    if (!name) throw new Error('register() requires a name');
    if (!serviceEndpoint) throw new Error('register() requires a serviceEndpoint');

    const identity = {
      owner: this.address,
      name,
      version,
      serviceEndpoint,
      capabilityHash: capabilityHash || ethers.ZeroHash,
      registeredAt: 0n,
      active: true,
    };

    const tx = await this._withNonceLock((nonce) =>
      this.registry.registerAgent(identity, { nonce })
    );
    const receipt = await tx.wait();

    let agentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = this.registry.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'AgentRegistered') { agentId = parsed.args.agentId; break; }
      } catch { /* ignore */ }
    }

    this.agentId = agentId;
    return { txHash: tx.hash, agentId, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  _formatAgentRecord(agentId, record) {
    return {
      agentId,
      erc8004: true,
      owner: record.owner,
      name: record.name,
      version: record.version,
      serviceEndpoint: record.serviceEndpoint,
      capabilityHash: record.capabilityHash,
      registeredAt: Number(record.registeredAt),
      active: record.active,
      reputation: Number(record.reputation),
      dilithiumPubKeyHash: record.dilithiumPubKeyHash,
      trustScore: Number(record.trustScore),
      quantumLayerMask: Number(record.quantumLayerMask),
    };
  }

  async getAgent(agentIdOrAddress = this.agentId || this.address) {
    // Accept either a bytes32 agentId (66-char hex) or an owner address (42-char).
    if (agentIdOrAddress && agentIdOrAddress.length > 42) {
      const record = await this.registry.getAgentRecord(agentIdOrAddress);
      return this._formatAgentRecord(agentIdOrAddress, record);
    }
    const [agentId, record] = await this.registry.getAgentByOwner(agentIdOrAddress);
    return this._formatAgentRecord(agentId, record);
  }

  async getReputation(agentIdOrAddress = this.agentId || this.address) {
    return (await this.getAgent(agentIdOrAddress)).reputation;
  }

  async getBalance() {
    const balance = await this.provider.getBalance(this.address);
    return ethers.formatEther(balance);
  }

  async _apiPost(path, body) {
    if (!this.apiUrl) {
      throw new Error(`${path} requires apiUrl to be set in the Qorbitpay constructor`);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (this.agentId) headers['X-Agent-Id'] = this.agentId;
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `${path} failed with status ${res.status}`);
    return data;
  }

  /// VQC fraud score via the hosted quantum services (POST /api/fraud).
  checkFraud({ amount_zscore, agent_age_days, tx_frequency, dispute_rate } = {}) {
    return this._apiPost('/api/fraud', { amount_zscore, agent_age_days, tx_frequency, dispute_rate });
  }

  /// QAOA-optimal provider selection via the hosted quantum services (POST /api/route).
  findRoute(providers) {
    return this._apiPost('/api/route', { providers });
  }

  /// Create a recurring subscription to pay `to` agent `amount` USDC every `period`.
  /// `period` can be seconds (number) or a shorthand string: '7d', '24h', '1w', etc.
  /// `initialBalance` (optional) pre-funds the subscription; defaults to one period's amount.
  async subscribe({ to, amount, period, initialBalance } = {}) {
    if (!to || !ethers.isAddress(to)) throw new Error('subscribe() requires a valid `to` address');
    if (!amount || Number(amount) <= 0) throw new Error('subscribe() requires a positive `amount`');
    if (!period) throw new Error('subscribe() requires a `period` (e.g. "7d", 604800)');

    const periodSeconds = BigInt(_parsePeriod(period));
    const amountWei = ethers.parseEther(String(amount));
    const balanceWei = initialBalance ? ethers.parseEther(String(initialBalance)) : amountWei;

    const tx = await this._withNonceLock((nonce) =>
      this.billing.createSubscription(to, amountWei, periodSeconds, { value: balanceWei, nonce })
    );
    const receipt = await tx.wait();

    let subId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = this.billing.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'SubscriptionCreated') {
          subId = parsed.args.subId;
          break;
        }
      } catch { /* ignore */ }
    }

    return {
      subId,
      to,
      amount: String(amount),
      periodSeconds: Number(periodSeconds),
      initialBalance: ethers.formatEther(balanceWei),
      txHash: tx.hash,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${this.explorer}/tx/${tx.hash}`,
    };
  }

  /// Cancel a subscription (subscriber only). Refunds remaining balance.
  async cancelSubscription(subId) {
    if (!subId) throw new Error('cancelSubscription() requires a subId');
    const tx = await this._withNonceLock((nonce) => this.billing.cancelSubscription(subId, { nonce }));
    const receipt = await tx.wait();
    return { txHash: tx.hash, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  /// Spend from a treasury budget. `from` is the treasury address, `category` is
  /// 'data' | 'compute' | 'storage' or a numeric bitmask.
  async spend({ from, amount, category = 'data' } = {}) {
    if (!from || !ethers.isAddress(from)) throw new Error('spend() requires a valid `from` (treasury) address');
    if (!amount || Number(amount) <= 0) throw new Error('spend() requires a positive `amount`');

    const cat = typeof category === 'string'
      ? (CATEGORY[category.toLowerCase()] ?? (() => { throw new Error(`unknown category: ${category}`); })())
      : Number(category);
    const amountWei = ethers.parseEther(String(amount));

    const tx = await this._withNonceLock((nonce) =>
      this.treasury.spend(from, amountWei, BigInt(cat), { nonce })
    );
    const receipt = await tx.wait();

    return {
      from,
      to: this.address,
      amount: String(amount),
      category,
      txHash: tx.hash,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${this.explorer}/tx/${tx.hash}`,
    };
  }

  /// Deposit funds into the treasury under this agent's address.
  async depositToTreasury(amount) {
    if (!amount || Number(amount) <= 0) throw new Error('depositToTreasury() requires a positive amount');
    const value = ethers.parseEther(String(amount));
    const tx = await this._withNonceLock((nonce) => this.treasury.deposit({ value, nonce }));
    const receipt = await tx.wait();
    return { txHash: tx.hash, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  /// Allocate a spending budget to a worker agent.
  async allocateBudget({ worker, dailyCap, categoryMask = CATEGORY.all, expiresAt } = {}) {
    if (!worker || !ethers.isAddress(worker)) throw new Error('allocateBudget() requires a valid `worker` address');
    if (!dailyCap || Number(dailyCap) <= 0) throw new Error('allocateBudget() requires a positive `dailyCap`');
    if (!expiresAt) throw new Error('allocateBudget() requires an `expiresAt` unix timestamp');

    const tx = await this._withNonceLock((nonce) =>
      this.treasury.allocateBudget(worker, ethers.parseEther(String(dailyCap)), BigInt(categoryMask), BigInt(expiresAt), { nonce })
    );
    const receipt = await tx.wait();
    return { txHash: tx.hash, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }
}

function _parsePeriod(period) {
  if (typeof period === 'number') return period;
  const str = String(period);
  if (/^\d+$/.test(str)) return Number(str);
  const match = str.match(/^(\d+(?:\.\d+)?)(s|m|h|d|w)$/);
  if (!match) throw new Error(`invalid period: ${period} (use e.g. 7d, 24h, 3600)`);
  const n = Number(match[1]);
  const units = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Math.round(n * units[match[2]]);
}

export { Qorbitpay, CATEGORY };
