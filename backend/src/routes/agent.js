import express from 'express';
import { ethers } from 'ethers';
import { provider } from '../services/arc-chain.js';
import { registryContract } from '../services/contracts.js';
import { getRecent } from '../services/recentPayments.js';
import { getEscrowsByParty } from '../services/escrowStore.js';

const router = express.Router();

/// GET /api/agent/:address/summary
/// Returns chain balance, registry info, and payment totals derived from the in-memory buffer.
router.get('/:address/summary', async (req, res) => {
  const { address } = req.params;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }

  try {
    const [balanceWei, agentLookup] = await Promise.all([
      provider.getBalance(address).catch(() => 0n),
      registryContract().getAgentByOwner(address).catch(() => null),
    ]);

    const payments = getRecent(200);
    const lowerAddr = address.toLowerCase();
    const sent = payments.filter((p) => p.from?.toLowerCase() === lowerAddr);
    const received = payments.filter((p) => p.to?.toLowerCase() === lowerAddr);
    const totalSpent = sent.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalEarned = received.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const [agentId, agentInfo] = agentLookup ?? [null, null];
    const isRegistered = agentInfo && Number(agentInfo.registeredAt) !== 0;
    const agent = isRegistered
      ? {
          registered: true,
          erc8004: true,
          agentId,
          owner: agentInfo.owner,
          name: agentInfo.name,
          version: agentInfo.version,
          serviceEndpoint: agentInfo.serviceEndpoint,
          capabilityHash: agentInfo.capabilityHash,
          registeredAt: Number(agentInfo.registeredAt),
          active: agentInfo.active,
          reputation: Number(agentInfo.reputation),
          trustScore: Number(agentInfo.trustScore),
          quantumLayerMask: Number(agentInfo.quantumLayerMask),
        }
      : { registered: false };

    res.json({
      address,
      balance: ethers.formatEther(balanceWei),
      agent,
      totalEarned: totalEarned.toFixed(6),
      totalSpent: totalSpent.toFixed(6),
      txCount: sent.length + received.length,
    });
  } catch (err) {
    console.error('GET /api/agent/:address/summary failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// GET /api/agent/:address/transactions
/// Returns in-memory payments where address is sender or receiver, newest first.
router.get('/:address/transactions', (req, res) => {
  const { address } = req.params;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }

  const lowerAddr = address.toLowerCase();
  const payments = getRecent(200);
  const txs = payments.filter(
    (p) => p.from?.toLowerCase() === lowerAddr || p.to?.toLowerCase() === lowerAddr
  );
  res.json({ transactions: txs, address });
});

/// GET /api/agent/:address/escrows
/// Returns escrows where address is payer or payee (tracked in-memory).
router.get('/:address/escrows', (req, res) => {
  const { address } = req.params;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }

  const escrows = getEscrowsByParty(address).filter((e) => !e.released && !e.refunded);
  res.json({ escrows, address });
});

export default router;
