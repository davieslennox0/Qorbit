import { ethers } from 'ethers';
import { ROUTER_ABI, REGISTRY_ABI } from './abi.js';
import { DEFAULT_NETWORK } from './config.js';

/// Quatripe SDK - a thin client for AI agents to send/receive payments directly on Arc,
/// using the agent's own funded wallet (self-sovereign), rather than going through
/// Quatripe's custodial backend relayer. The relayer's extra protections (QRNG-anchored
/// nonces, VQC fraud screening, QAOA routing, Dilithium dual-signing/attestation) are
/// features of the hosted POST /api/pay endpoint, not requirements of the on-chain
/// protocol itself - calling the contracts directly here is a fully valid, lighter-weight
/// way to use Quatripe. checkFraud()/findRoute() below call the hosted quantum services
/// over HTTP for agents that want those signals without running Qiskit themselves.
class Quatripe {
  constructor({
    privateKey,
    rpcUrl = DEFAULT_NETWORK.rpcUrl,
    chainId = DEFAULT_NETWORK.chainId,
    routerAddress = DEFAULT_NETWORK.routerAddress,
    registryAddress = DEFAULT_NETWORK.registryAddress,
    apiUrl = null,
  } = {}) {
    if (!privateKey) throw new Error('Quatripe SDK requires a privateKey');

    this.provider = new ethers.JsonRpcProvider(rpcUrl, { chainId, name: 'arc-testnet' });
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
    this.apiUrl = apiUrl;
    this.explorer = DEFAULT_NETWORK.explorer;

    this.router = new ethers.Contract(routerAddress, ROUTER_ABI, this.wallet);
    this.registry = new ethers.Contract(registryAddress, REGISTRY_ABI, this.wallet);

    // Guards against nonce races if an agent fires multiple pay()/register() calls
    // without awaiting each one - same class of bug found in the backend relayer.
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

  /// Sends a native-token (USDC) payment to `to` via QuatripeRouter.pay(). `memo` is
  /// hashed (keccak256) on-chain as an opaque reference - pass the same memo string
  /// elsewhere if you need to look the payment back up.
  async pay({ to, amount, memo } = {}) {
    if (!to || !ethers.isAddress(to)) throw new Error('pay() requires a valid `to` address');
    if (!amount || Number(amount) <= 0) throw new Error('pay() requires a positive `amount`');

    const memoHash = memo ? ethers.keccak256(ethers.toUtf8Bytes(memo)) : ethers.ZeroHash;
    const value = ethers.parseEther(String(amount));

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

  /// Registers this agent in QuatripeRegistry under its own address (self-sovereign -
  /// owner and agent are the same wallet). For custodial registration on the agent's
  /// behalf, see the backend's POST /api/receive instead.
  async register({ serviceEndpoint } = {}) {
    if (!serviceEndpoint) throw new Error('register() requires a serviceEndpoint');
    const tx = await this._withNonceLock((nonce) =>
      this.registry.registerAgent(this.address, serviceEndpoint, { nonce })
    );
    const receipt = await tx.wait();
    return { txHash: tx.hash, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async getAgent(address = this.address) {
    const agent = await this.registry.getAgent(address);
    return {
      owner: agent.owner,
      serviceEndpoint: agent.serviceEndpoint,
      reputation: Number(agent.reputation),
      registeredAt: Number(agent.registeredAt),
      active: agent.active,
    };
  }

  async getReputation(address = this.address) {
    return (await this.getAgent(address)).reputation;
  }

  async getBalance() {
    const balance = await this.provider.getBalance(this.address);
    return ethers.formatEther(balance);
  }

  async _apiPost(path, body) {
    if (!this.apiUrl) {
      throw new Error(`${path} requires apiUrl to be set in the Quatripe constructor`);
    }
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
}

export { Quatripe };
