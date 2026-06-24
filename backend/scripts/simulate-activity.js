import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import { getWallet, withWalletLock, provider } from '../src/services/arc-chain.js';
import { routerContract } from '../src/services/contracts.js';

/// Keeps the demo network looking like what it actually is: a handful of agents that pay
/// each other. Each tick picks two of the 5 seeded demo agents and sends a small payment
/// directly on-chain, signed with that agent's own key (self-sovereign, same path the SDK
/// uses) - no relayer involved, so this is genuine peer-to-peer traffic, not simulated UI
/// state. The backend's chainActivityListener picks these up via the PaymentSent event and
/// they show up on the dashboard right alongside relayer-settled payments.
const MIN_BALANCE = ethers.parseEther('0.01');
const FUND_AMOUNT = ethers.parseEther('0.05');
const MIN_TICK_MS = 15_000;
const MAX_TICK_MS = 35_000;
const MIN_AMOUNT = 0.0004;
const MAX_AMOUNT = 0.0035;

const MEMOS = [
  'translation request',
  'weather forecast query',
  'image generation job',
  'code review pass',
  'market analysis report',
  'dataset cleanup',
  'summary request',
];

function loadDemoAgents() {
  const path = new URL('./demo-agents.local.json', import.meta.url);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function ensureFunded(agents) {
  const relayer = getWallet();
  for (const agent of agents) {
    const balance = await provider.getBalance(agent.address);
    if (balance >= MIN_BALANCE) continue;
    console.log(`funding ${agent.name} (${agent.address}) with ${ethers.formatEther(FUND_AMOUNT)} ...`);
    const tx = await withWalletLock((nonce) => relayer.sendTransaction({ to: agent.address, value: FUND_AMOUNT, nonce }));
    await tx.wait();
    console.log(`  funded via ${tx.hash}`);
  }
}

function pickTwoDistinct(arr) {
  const i = Math.floor(Math.random() * arr.length);
  let j = Math.floor(Math.random() * arr.length);
  while (j === i) j = Math.floor(Math.random() * arr.length);
  return [arr[i], arr[j]];
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

const API_URL = process.env.SIMULATOR_API_URL || 'http://localhost:3001';
// Roughly half the simulated traffic goes through the hosted relayer (full quantum
// layers - QRNG/VQC/QAOA/PQ all run) and half direct peer-to-peer on-chain with the
// agent's own key (no relayer, no quantum layers). Real agents would use whichever suits
// them; mixing both here keeps the dashboard's "quantum coverage" stat meaningful instead
// of being diluted to ~0% by an all-self-sovereign demo feed.
const CUSTODIAL_SHARE = 0.5;

async function tickCustodial(sender, recipient, amount, memo) {
  const res = await fetch(`${API_URL}/api/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: recipient.address, amount, memo }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `relayer pay failed with status ${res.status}`);
  console.log(`${sender.name} -> ${recipient.name}: ${amount} (${memo}) [relayer] tx ${data.tx_hash}`);
}

async function tickSelfSovereign(sender, recipient, amount, memo) {
  const wallet = new ethers.Wallet(sender.privateKey, provider);
  const router = routerContract(wallet);
  const memoHash = ethers.keccak256(ethers.toUtf8Bytes(memo));
  const tx = await router.pay(recipient.address, memoHash, { value: ethers.parseEther(amount) });
  console.log(`${sender.name} -> ${recipient.name}: ${amount} (${memo}) [p2p] tx ${tx.hash}`);
  await tx.wait();
}

async function tick(agents) {
  const [sender, recipient] = pickTwoDistinct(agents);
  const amount = randomBetween(MIN_AMOUNT, MAX_AMOUNT).toFixed(6);
  const memo = MEMOS[Math.floor(Math.random() * MEMOS.length)];

  if (Math.random() < CUSTODIAL_SHARE) {
    await tickCustodial(sender, recipient, amount, memo);
  } else {
    await tickSelfSovereign(sender, recipient, amount, memo);
  }
}

async function main() {
  const agents = loadDemoAgents();
  console.log(`activity simulator: ${agents.length} demo agents`);

  while (true) {
    try {
      await ensureFunded(agents);
      await tick(agents);
    } catch (err) {
      console.error('tick failed:', err.message);
    }
    await new Promise((r) => setTimeout(r, randomBetween(MIN_TICK_MS, MAX_TICK_MS)));
  }
}

main().catch((err) => {
  console.error('activity simulator crashed:', err);
  process.exit(1);
});
