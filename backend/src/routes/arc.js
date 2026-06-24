import express from 'express';
import { ethers } from 'ethers';
import { getNetworkInfo, getWallet, getBalance } from '../services/arc-chain.js';

const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    const network = await getNetworkInfo();
    res.json({ connected: true, network });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

router.get('/wallet', async (req, res) => {
  try {
    const wallet = getWallet();
    const balance = await getBalance(wallet.address);
    res.json({ address: wallet.address, balance: ethers.formatEther(balance) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
