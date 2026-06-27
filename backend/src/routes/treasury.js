import express from 'express';
import { ethers } from 'ethers';
import { getWallet, withWalletLock } from '../services/arc-chain.js';
import { treasuryContract } from '../services/contracts.js';
import { addBudget, removeBudget, getBudgetsForTreasury, getBudgetsForWorker } from '../services/treasuryStore.js';

const router = express.Router();
const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';

const CAT_NAMES = { data: 0x01, compute: 0x02, storage: 0x04 };

function categoryToMask(category) {
  if (typeof category === 'number') return category;
  if (typeof category === 'string') {
    const lower = category.toLowerCase();
    if (CAT_NAMES[lower] !== undefined) return CAT_NAMES[lower];
    if (/^0x[0-9a-f]+$/i.test(lower)) return parseInt(lower, 16);
    if (/^\d+$/.test(lower)) return Number(lower);
  }
  if (Array.isArray(category)) {
    return category.reduce((mask, c) => mask | categoryToMask(c), 0);
  }
  throw new Error(`invalid category: ${category}`);
}

/// POST /api/treasury/allocate
/// Body: { treasury, worker, dailyCap, categoryMask, expiresAt, depositAmount }
router.post('/allocate', async (req, res) => {
  try {
    const { treasury, worker, dailyCap, categoryMask, expiresAt, depositAmount } = req.body || {};

    if (!worker || !ethers.isAddress(worker)) {
      return res.status(400).json({ error: 'worker must be a valid address' });
    }
    if (!dailyCap || Number(dailyCap) <= 0) {
      return res.status(400).json({ error: 'dailyCap must be positive' });
    }
    if (!expiresAt || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'expiresAt must be a future unix timestamp' });
    }

    const mask = categoryMask !== undefined ? categoryToMask(categoryMask) : 0x07; // default: all
    const dailyCapWei = ethers.parseEther(String(dailyCap));
    const wallet = getWallet();
    const tc = treasuryContract(wallet);
    const treasuryAddr = treasury || wallet.address;

    let results = [];

    if (depositAmount && Number(depositAmount) > 0) {
      const depositWei = ethers.parseEther(String(depositAmount));
      const depositTx = await withWalletLock((nonce) =>
        tc.depositFor(treasuryAddr, { value: depositWei, nonce })
      );
      const depositReceipt = await depositTx.wait();
      results.push({ type: 'deposit', tx_hash: depositTx.hash, status: depositReceipt.status === 1 ? 'confirmed' : 'failed' });
    }

    const allocTx = await withWalletLock((nonce) =>
      tc.allocateBudgetFor(treasuryAddr, worker, dailyCapWei, BigInt(mask), BigInt(expiresAt), { nonce })
    );
    const allocReceipt = await allocTx.wait();

    addBudget({
      treasury: treasuryAddr,
      worker,
      dailyCap: String(dailyCap),
      categoryMask: mask,
      expiresAt: Number(expiresAt),
      createdAt: Date.now(),
    });

    results.push({
      type: 'allocate',
      tx_hash: allocTx.hash,
      status: allocReceipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${EXPLORER}/tx/${allocTx.hash}`,
    });

    res.json({
      treasury: treasuryAddr,
      worker,
      dailyCap: String(dailyCap),
      categoryMask: mask,
      expiresAt: Number(expiresAt),
      results,
    });
  } catch (err) {
    console.error('POST /api/treasury/allocate failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// POST /api/treasury/spend
/// Body: { treasury, worker, amount, category }
router.post('/spend', async (req, res) => {
  try {
    const { treasury, worker, amount, category } = req.body || {};

    if (!treasury || !ethers.isAddress(treasury)) {
      return res.status(400).json({ error: 'treasury must be a valid address' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    const cat = category !== undefined ? categoryToMask(category) : 0x01;
    const amountWei = ethers.parseEther(String(amount));
    const wallet = getWallet();
    const tc = treasuryContract(wallet);
    const workerAddr = worker || wallet.address;

    const tx = await withWalletLock((nonce) =>
      tc.spendFor(treasury, workerAddr, amountWei, BigInt(cat), { nonce })
    );
    const receipt = await tx.wait();

    res.json({
      treasury,
      worker: workerAddr,
      amount: String(amount),
      category: cat,
      tx_hash: tx.hash,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
    });
  } catch (err) {
    console.error('POST /api/treasury/spend failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// POST /api/treasury/revoke
/// Body: { treasury, worker }
router.post('/revoke', async (req, res) => {
  try {
    const { treasury, worker } = req.body || {};
    if (!worker || !ethers.isAddress(worker)) {
      return res.status(400).json({ error: 'worker must be a valid address' });
    }

    const wallet = getWallet();
    const tc = treasuryContract(wallet);
    const treasuryAddr = treasury || wallet.address;

    const tx = await withWalletLock((nonce) =>
      tc.revokeBudgetFor(treasuryAddr, worker, { nonce })
    );
    const receipt = await tx.wait();

    removeBudget(treasuryAddr, worker);

    res.json({
      treasury: treasuryAddr,
      worker,
      tx_hash: tx.hash,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
    });
  } catch (err) {
    console.error('POST /api/treasury/revoke failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/// POST /api/treasury/register
/// Called after a MetaMask-signed allocateBudget tx. Stores the budget in the backend index.
/// Body: { treasury, worker, dailyCap, categoryMask, expiresAt }
router.post('/register', (req, res) => {
  const { treasury, worker, dailyCap, categoryMask, expiresAt } = req.body || {};
  if (!treasury || !worker) return res.status(400).json({ error: 'treasury and worker required' });
  addBudget({ treasury, worker, dailyCap: String(dailyCap), categoryMask: Number(categoryMask), expiresAt: Number(expiresAt), createdAt: Date.now() });
  res.json({ ok: true });
});

/// POST /api/treasury/deregister
/// Called after a MetaMask-signed revokeBudget tx.
/// Body: { treasury, worker }
router.post('/deregister', (req, res) => {
  const { treasury, worker } = req.body || {};
  if (!treasury || !worker) return res.status(400).json({ error: 'treasury and worker required' });
  removeBudget(treasury, worker);
  res.json({ ok: true });
});

/// GET /api/treasury/:address
/// Returns budgets allocated BY this address (as treasury) and TO this address (as worker).
/// Also queries chain for on-chain budget state for known counterparties.
router.get('/:address', async (req, res) => {
  const { address } = req.params;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }

  try {
    const tc = treasuryContract();

    const [asAllocator, asWorker] = await Promise.all([
      getBudgetsForTreasury(address),
      getBudgetsForWorker(address),
    ]);

    // Enrich with live on-chain state
    const enrichBudget = async (b, isTreasury) => {
      try {
        const t = isTreasury ? address : b.treasury;
        const w = isTreasury ? b.worker : address;
        const [remaining, dailyCap, expiresAt, categoryMask, active] = await tc.getBudget(t, w);
        return {
          ...b,
          remaining: ethers.formatEther(remaining),
          dailyCapWei: dailyCap.toString(),
          active,
        };
      } catch {
        return b;
      }
    };

    const [enrichedAllocator, enrichedWorker] = await Promise.all([
      Promise.all(asAllocator.map((b) => enrichBudget(b, true))),
      Promise.all(asWorker.map((b) => enrichBudget(b, false))),
    ]);

    // On-chain treasury balance
    let chainBalance = null;
    try {
      const bal = await tc.treasuryBalances(address);
      chainBalance = ethers.formatEther(bal);
    } catch {
      // not critical
    }

    res.json({
      address,
      chainBalance,
      budgetsAllocated: enrichedAllocator,
      budgetsReceived: enrichedWorker,
    });
  } catch (err) {
    console.error('GET /api/treasury/:address failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
