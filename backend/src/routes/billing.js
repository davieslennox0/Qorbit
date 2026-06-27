import express from 'express';
import { ethers } from 'ethers';
import { getWallet, withWalletLock } from '../services/arc-chain.js';
import { billingContract } from '../services/contracts.js';
import { addSub, removeSub, getAllSubs, getSubsByAgent, getSubsBySubscriber } from '../services/billingStore.js';

const router = express.Router();
const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';

function parsePeriod(period) {
  if (typeof period === 'number') return period;
  const str = String(period);
  if (/^\d+$/.test(str)) return Number(str);
  const match = str.match(/^(\d+(?:\.\d+)?)(s|m|h|d|w)$/);
  if (!match) throw new Error(`invalid period format: ${period} (use e.g. 7d, 24h, 3600)`);
  const n = Number(match[1]);
  const units = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Math.round(n * units[match[2]]);
}

/// POST /api/billing/subscribe
/// Body: { subscriber, agent, amountPerPeriod, period, initialBalance }
/// subscriber/agent are address strings; amountPerPeriod and initialBalance are USDC strings;
/// period is seconds or shorthand like '7d'.
router.post('/subscribe', async (req, res) => {
  try {
    const { subscriber, agent, amountPerPeriod, period, initialBalance } = req.body || {};

    if (!agent || !ethers.isAddress(agent)) {
      return res.status(400).json({ error: 'agent must be a valid address' });
    }
    if (!amountPerPeriod || Number(amountPerPeriod) <= 0) {
      return res.status(400).json({ error: 'amountPerPeriod must be positive' });
    }
    if (!period) {
      return res.status(400).json({ error: 'period is required (e.g. 7d, 604800)' });
    }

    const periodSeconds = parsePeriod(period);
    const amountWei = ethers.parseEther(String(amountPerPeriod));
    const balanceWei = initialBalance ? ethers.parseEther(String(initialBalance)) : amountWei;

    const wallet = getWallet();
    const billing = billingContract(wallet);

    const tx = await withWalletLock((nonce) =>
      billing.createSubscription(agent, amountWei, BigInt(periodSeconds), {
        value: balanceWei,
        nonce,
      })
    );
    const receipt = await tx.wait();

    // Parse the SubscriptionCreated event to get the subId.
    let subId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = billing.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'SubscriptionCreated') {
          subId = parsed.args.subId;
          break;
        }
      } catch {
        // ignore unparseable logs
      }
    }

    if (subId) {
      addSub({
        subId,
        subscriber: subscriber || wallet.address,
        agent,
        amountPerPeriod: String(amountPerPeriod),
        periodSeconds,
        createdAt: Date.now(),
      });
    }

    res.json({
      subId,
      subscriber: subscriber || wallet.address,
      agent,
      amountPerPeriod: String(amountPerPeriod),
      periodSeconds,
      initialBalance: ethers.formatEther(balanceWei),
      tx_hash: tx.hash,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
    });
  } catch (err) {
    console.error('POST /api/billing/subscribe failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// POST /api/billing/cancel
/// Body: { subId }
router.post('/cancel', async (req, res) => {
  try {
    const { subId } = req.body || {};
    if (!subId) return res.status(400).json({ error: 'subId is required' });

    const wallet = getWallet();
    const billing = billingContract(wallet);

    const tx = await withWalletLock((nonce) => billing.cancelSubscription(subId, { nonce }));
    const receipt = await tx.wait();

    removeSub(subId);

    res.json({
      subId,
      tx_hash: tx.hash,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
    });
  } catch (err) {
    console.error('POST /api/billing/cancel failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// GET /api/billing/subscriptions/:agentAddress
/// Returns subscriptions known to this backend where agent === agentAddress.
router.get('/subscriptions/:agentAddress', (req, res) => {
  const { agentAddress } = req.params;
  if (!ethers.isAddress(agentAddress)) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const subs = getSubsByAgent(agentAddress);
  res.json({ subscriptions: subs, agentAddress });
});

/// GET /api/billing/subscriptions-by/:subscriberAddress
router.get('/subscriptions-by/:subscriberAddress', (req, res) => {
  const { subscriberAddress } = req.params;
  if (!ethers.isAddress(subscriberAddress)) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const subs = getSubsBySubscriber(subscriberAddress);
  res.json({ subscriptions: subs, subscriberAddress });
});

/// POST /api/billing/process-due
/// Called by the billing cron. Checks all tracked subscriptions and processes any that are due.
router.post('/process-due', async (req, res) => {
  const all = getAllSubs();
  const results = [];

  const wallet = getWallet();
  const billing = billingContract(wallet);

  for (const sub of all) {
    try {
      const due = await billing.isDue(sub.subId);
      if (!due) {
        results.push({ subId: sub.subId, skipped: true, reason: 'not due' });
        continue;
      }
      const tx = await withWalletLock((nonce) => billing.processPayment(sub.subId, { nonce }));
      const receipt = await tx.wait();
      results.push({
        subId: sub.subId,
        tx_hash: tx.hash,
        status: receipt.status === 1 ? 'confirmed' : 'failed',
      });
    } catch (err) {
      results.push({ subId: sub.subId, error: err.message });
    }
  }

  res.json({ processed: results.length, results });
});

export default router;
