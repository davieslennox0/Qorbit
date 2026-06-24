import express from 'express';
import { ethers } from 'ethers';
import { getWallet, withWalletLock } from '../services/arc-chain.js';
import { routerContract, registryContract } from '../services/contracts.js';
import { getQuantumNonce } from '../services/qrng.js';
import { anchorNonce } from '../services/batchAnchor.js';
import { parsePaymentHeader, X402PaymentError } from '../middleware/x402.js';
import { runVqcFraudCheck, runQaoaRouter } from '../services/quantumBridge.js';
import { dualSignPayment, attestOnChain } from '../middleware/pq-signing.js';
import { pushPayment, getRecent } from '../services/recentPayments.js';

const router = express.Router();
const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';
const PQ_ATTESTATION_THRESHOLD = Number(process.env.PQ_ATTESTATION_THRESHOLD || 0.10);

// Default fraud signal baseline used when the caller doesn't supply real ones: an
// established, low-frequency, dispute-free profile, so VQC still runs (and reports) on
// every payment without blocking callers that have no risk telemetry to send yet.
const DEFAULT_FRAUD_SIGNALS = { amount_zscore: 0, agent_age_days: 365, tx_frequency: 1, dispute_rate: 0 };

/// POST /api/pay - send a native-token (USDC) payment via QuatripeRouter, running all
/// four quantum layers in the process:
///   1. QRNG    - quantum nonce anchors this payment's memo and doubles as the PQ
///                authorization's anti-replay nonce.
///   2. VQC     - fraud-scores the payment before it's allowed to settle.
///   3. QAOA    - if `providers` is given instead of a fixed `to`, picks the best one.
///   4. Dilithium - dual-signs (ECDSA + ML-DSA-44) the authorization; payments above
///                PQ_ATTESTATION_THRESHOLD also get an on-chain attestation.
/// Accepts either a JSON body { to | providers, amount, memo, fraudSignals } or an x402
/// X-PAYMENT header (parsed per the coinbase/x402 "exact" scheme); see middleware/x402.js
/// for why settlement goes through the router rather than transferWithAuthorization.
router.post('/pay', async (req, res) => {
  const quantumLayers = {
    qrng: { ran: false },
    vqc: { ran: false },
    qaoa: { ran: false },
    dilithium: { ran: false },
  };

  try {
    let to;
    let amount;
    let memo;
    let providers;
    let fraudSignals;

    const x402Header = req.headers['x-payment'];
    if (x402Header) {
      try {
        const payload = parsePaymentHeader(x402Header);
        to = payload.payload.authorization.to;
        amount = ethers.formatEther(payload.payload.authorization.value);
        memo = 'x402';
      } catch (err) {
        if (err instanceof X402PaymentError) {
          return res.status(402).json({ error: err.message });
        }
        throw err;
      }
    } else {
      ({ to, amount, memo, providers, fraudSignals } = req.body || {});
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number (native token units)' });
    }

    // Layer 3 (QAOA): if a candidate provider list is given instead of a fixed `to`,
    // route to whichever one QAOA selects.
    let qaoaResult = null;
    if (Array.isArray(providers) && providers.length > 0) {
      for (const p of providers) {
        if (!p.address || !ethers.isAddress(p.address)) {
          return res.status(400).json({ error: 'each provider needs a valid address' });
        }
      }
      qaoaResult = await runQaoaRouter(providers);
      quantumLayers.qaoa = { ran: true, ...qaoaResult };
      const chosen = providers.find((p) => p.id === qaoaResult.optimal_route);
      if (!chosen) {
        return res.status(500).json({ error: 'QAOA selected a route not present in the provider list' });
      }
      to = chosen.address;
    }

    if (!to || !ethers.isAddress(to)) {
      return res.status(400).json({ error: 'to must be a valid address (or supply providers for QAOA routing)' });
    }

    // Layer 2 (VQC): fraud-score the payment; block settlement if flagged.
    const signals = { ...DEFAULT_FRAUD_SIGNALS, ...(fraudSignals || {}) };
    const vqcResult = await runVqcFraudCheck(signals);
    quantumLayers.vqc = { ran: true, ...vqcResult };
    if (vqcResult.flagged) {
      return res.status(403).json({
        error: 'payment blocked by VQC fraud detection',
        quantum_layers: quantumLayers,
      });
    }

    // Layer 1 (QRNG): quantum nonce anchors the memo and the PQ authorization.
    const { nonce, source } = await getQuantumNonce();
    quantumLayers.qrng = { ran: true, source, nonce };
    const memoHash = ethers.keccak256(ethers.toUtf8Bytes(nonce));

    const wallet = getWallet();
    const routerContractInstance = routerContract(wallet);
    const value = ethers.parseEther(amount);

    // Layer 4 (Dilithium): dual-sign before settlement.
    const pqAuthorization = {
      from: wallet.address,
      to,
      value,
      memoHash,
      nonce: BigInt(`0x${nonce}`),
    };
    const pqSigned = await dualSignPayment(wallet, pqAuthorization);
    quantumLayers.dilithium = {
      ran: true,
      algorithm: pqSigned.algorithm,
      messageHash: pqSigned.messageHash,
      attested: false,
    };

    const nonceProofPromise = anchorNonce(nonce);
    const tx = await withWalletLock((txNonce) =>
      routerContractInstance.pay(to, memoHash, { value, nonce: txNonce })
    );

    let attestationPromise = Promise.resolve(null);
    if (Number(amount) >= PQ_ATTESTATION_THRESHOLD) {
      attestationPromise = attestOnChain(wallet, {
        messageHash: pqSigned.messageHash,
        pqPublicKeyB64: pqSigned.pqPublicKey,
        valid: true,
      });
    }

    const [receipt, nonceProof, attestation] = await Promise.all([
      tx.wait(),
      nonceProofPromise,
      attestationPromise,
    ]);

    if (attestation) {
      quantumLayers.dilithium.attested = true;
      quantumLayers.dilithium.attestation_tx_hash = attestation.tx_hash;
      quantumLayers.dilithium.attestation_explorer_url = `${EXPLORER}/tx/${attestation.tx_hash}`;
    }

    res.set('X-Quantum-Nonce', nonce);
    res.set('X-Quantum-Nonce-Source', source);
    res.set('X-Signature-PQ', pqSigned.headers['X-Signature-PQ']);
    res.set('X-PQ-Algorithm', pqSigned.headers['X-PQ-Algorithm']);
    res.set(
      'X-PAYMENT-RESPONSE',
      Buffer.from(
        JSON.stringify({ success: true, transaction: tx.hash, network: 'arc-testnet', payer: wallet.address })
      ).toString('base64')
    );

    pushPayment({
      txHash: tx.hash,
      from: wallet.address,
      to,
      amount,
      memo: memo || null,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      blockNumber: receipt.blockNumber,
      explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
      quantumLayers,
    });

    res.json({
      tx_hash: tx.hash,
      quantum_nonce: nonce,
      quantum_nonce_source: source,
      nonce_proof: nonceProof,
      arc_explorer_url: `${EXPLORER}/tx/${tx.hash}`,
      from: wallet.address,
      to,
      amount,
      memo: memo || null,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      block_number: receipt.blockNumber,
      pq_signature: {
        algorithm: pqSigned.algorithm,
        signature: pqSigned.pqSignature,
        public_key: pqSigned.pqPublicKey,
        ecdsa_signature: pqSigned.ecdsaSignature,
      },
      quantum_layers: quantumLayers,
    });
  } catch (err) {
    console.error('POST /api/pay failed:', err);
    res.status(500).json({ error: err.message, quantum_layers: quantumLayers });
  }
});

/// POST /api/receive - register an agent as a payment receiver in QuatripeRegistry.
/// Supports custodial onboarding: the caller (our relayer wallet) registers `agent`'s
/// address and service endpoint; `agent` doesn't need to sign anything itself.
router.post('/receive', async (req, res) => {
  try {
    const { agent, serviceEndpoint } = req.body || {};
    if (!agent || !ethers.isAddress(agent)) {
      return res.status(400).json({ error: 'agent must be a valid address' });
    }
    if (!serviceEndpoint || typeof serviceEndpoint !== 'string') {
      return res.status(400).json({ error: 'serviceEndpoint is required' });
    }

    const wallet = getWallet();
    const registry = registryContract(wallet);
    const tx = await withWalletLock((txNonce) => registry.registerAgent(agent, serviceEndpoint, { nonce: txNonce }));
    const receipt = await tx.wait();

    res.json({
      tx_hash: tx.hash,
      arc_explorer_url: `${EXPLORER}/tx/${tx.hash}`,
      agent,
      serviceEndpoint,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      block_number: receipt.blockNumber,
    });
  } catch (err) {
    console.error('POST /api/receive failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// GET /api/agents - paginated agent discovery registry.
router.get('/agents', async (req, res) => {
  try {
    const offset = Number(req.query.offset || 0);
    const limit = Number(req.query.limit || 50);

    const registry = registryContract();
    const total = await registry.agentCount();
    const [page, addrs] = await registry.listAgents(offset, limit);

    const agents = addrs.map((address, i) => ({
      address,
      owner: page[i].owner,
      serviceEndpoint: page[i].serviceEndpoint,
      reputation: Number(page[i].reputation),
      registeredAt: Number(page[i].registeredAt),
      active: page[i].active,
    }));

    res.json({ total: Number(total), offset, limit, agents });
  } catch (err) {
    console.error('GET /api/agents failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// GET /api/payments/recent - in-memory ring buffer of recent settled payments, for the
/// dashboard's live network graph (no websocket - the frontend polls this).
router.get('/payments/recent', (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json({ payments: getRecent(limit) });
});

export default router;
