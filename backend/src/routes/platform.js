import express from 'express';
import { ethers } from 'ethers';
import { addPlatformSub, removePlatformSub, isActivePlatformSub } from '../services/platformStore.js';

const router = express.Router();

const PLATFORM_WALLET = (process.env.ARC_TEST_WALLET_ADDRESS || '0xf3139029B33fd42BC3adADbc41bBaA11203ACb6E').toLowerCase();
const MONTHLY_FEE_WEI = ethers.parseEther('9.99');
const PERIOD_SECONDS = 30 * 24 * 3600; // 30 days

/// POST /api/platform/register-sub
/// Called after MetaMask-signed createSubscription to the platform wallet.
/// Body: { subscriber, feature ('billing'|'treasury'), subId, txHash }
/// We trust the frontend here — no on-chain verification to keep it simple.
/// For production: verify txHash exists on-chain and matches the subscription params.
router.post('/register-sub', (req, res) => {
  const { subscriber, feature, subId, txHash } = req.body || {};
  if (!subscriber || !ethers.isAddress(subscriber)) {
    return res.status(400).json({ error: 'subscriber must be a valid address' });
  }
  if (!['billing', 'treasury'].includes(feature)) {
    return res.status(400).json({ error: "feature must be 'billing' or 'treasury'" });
  }
  if (!subId) {
    return res.status(400).json({ error: 'subId required' });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + PERIOD_SECONDS;
  addPlatformSub({ subscriber, feature, subId, expiresAt });

  res.json({ ok: true, subscriber, feature, expiresAt, txHash });
});

/// POST /api/platform/cancel-sub
/// Body: { subscriber, feature }
router.post('/cancel-sub', (req, res) => {
  const { subscriber, feature } = req.body || {};
  if (!subscriber || !feature) return res.status(400).json({ error: 'subscriber and feature required' });
  removePlatformSub(subscriber, feature);
  res.json({ ok: true });
});

/// GET /api/platform/sub/:subscriber/:feature
/// Returns { active: bool, expiresAt? }
router.get('/sub/:subscriber/:feature', (req, res) => {
  const { subscriber, feature } = req.params;
  if (!ethers.isAddress(subscriber)) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const active = isActivePlatformSub(subscriber, feature);
  res.json({ subscriber, feature, active });
});

export { MONTHLY_FEE_WEI, PERIOD_SECONDS, PLATFORM_WALLET };
export default router;
