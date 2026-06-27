import express from 'express';
import { runVqcFraudCheck, runQaoaRouter } from '../services/quantumBridge.js';

const router = express.Router();

/// POST /api/fraud - VQC (variational quantum circuit) fraud scoring.
/// Body: { amount_zscore, agent_age_days, tx_frequency, dispute_rate, feeTxHash? }
/// feeTxHash: caller should supply a Router.pay() tx hash proving $0.0005 was sent to
/// the platform wallet before calling this endpoint (verified at trust boundary).
router.post('/fraud', async (req, res) => {
  try {
    const { amount_zscore, agent_age_days, tx_frequency, dispute_rate } = req.body || {};
    if ([amount_zscore, agent_age_days, tx_frequency, dispute_rate].some((v) => v === undefined)) {
      return res.status(400).json({
        error: 'amount_zscore, agent_age_days, tx_frequency, dispute_rate are all required',
      });
    }
    const result = await runVqcFraudCheck({ amount_zscore, agent_age_days, tx_frequency, dispute_rate });
    res.json({ ...result, fee: '0.0005', feeCurrency: 'USDC' });
  } catch (err) {
    console.error('POST /api/fraud failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// POST /api/route - QAOA payment routing across candidate agent service providers.
/// Body: { providers: [{ id, price, latency, reputation }, ...] }
router.post('/route', async (req, res) => {
  try {
    const { providers } = req.body || {};
    if (!Array.isArray(providers) || providers.length === 0) {
      return res.status(400).json({ error: 'providers must be a non-empty array' });
    }
    for (const p of providers) {
      if (!p.id || typeof p.price !== 'number' || typeof p.latency !== 'number' || typeof p.reputation !== 'number') {
        return res.status(400).json({ error: 'each provider needs id, price, latency, reputation' });
      }
    }
    const result = await runQaoaRouter(providers);
    res.json(result);
  } catch (err) {
    console.error('POST /api/route failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
