import { getWallet, withWalletLock } from './arc-chain.js';
import { routerContract } from './contracts.js';
import { sha256, buildLayers, getRoot, getProof } from '../utils/merkle.js';

const BATCH_SIZE = Number(process.env.NONCE_BATCH_SIZE || 5);
const FLUSH_DEBOUNCE_MS = Number(process.env.NONCE_BATCH_FLUSH_MS || 3000);
const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';

let pending = [];
let flushTimer = null;

async function flush() {
  const batch = pending;
  pending = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (batch.length === 0) return;

  const leaves = batch.map((item) => item.leaf);
  const layers = buildLayers(leaves);
  const root = getRoot(layers);
  const rootHex = `0x${root.toString('hex')}`;

  try {
    const wallet = getWallet();
    const router = routerContract(wallet);
    const tx = await withWalletLock((txNonce) => router.anchorBatch(rootHex, batch.length, { nonce: txNonce }));
    const receipt = await tx.wait();
    batch.forEach((item, i) => {
      const proof = getProof(layers, i).map((p) => ({ position: p.position, hash: `0x${p.hash}` }));
      item.resolve({
        merkleRoot: rootHex,
        leafIndex: i,
        batchSize: batch.length,
        proof,
        anchorTxHash: tx.hash,
        anchorBlockNumber: receipt.blockNumber,
        explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
      });
    });
  } catch (err) {
    batch.forEach((item) => item.reject(err));
  }
}

/// Queues a quantum nonce for SHA-256 Merkle batch anchoring on Arc. Resolves once the
/// batch (size BATCH_SIZE, or whatever has accumulated after FLUSH_DEBOUNCE_MS) has been
/// anchored on-chain via QuatripeRouter.anchorBatch, with a Merkle proof tying this nonce
/// to the anchored root.
function anchorNonce(nonceHex) {
  return new Promise((resolve, reject) => {
    const leaf = sha256(Buffer.from(nonceHex, 'hex'));
    pending.push({ leaf, resolve, reject });
    if (pending.length >= BATCH_SIZE) {
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
    }
  });
}

export { anchorNonce };
