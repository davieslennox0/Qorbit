import { ethers } from 'ethers';
import { routerContract } from './contracts.js';
import { provider } from './arc-chain.js';
import { pushPayment } from './recentPayments.js';
import { pushEscrow, updateEscrow } from './escrowStore.js';

const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';
const POLL_MS = 6000;
const LOOKBACK_BLOCKS = 100;

const ESCROW_ABI = [
  'event EscrowCreated(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, uint64 timeoutSeconds)',
  'event EscrowReleased(uint256 indexed id)',
  'event EscrowRefunded(uint256 indexed id)',
];

function startActivityListener() {
  const router = routerContract();
  const routerEscrow = new ethers.Contract(process.env.ROUTER_ADDRESS, ESCROW_ABI, provider);

  let lastBlock = null;

  async function poll() {
    try {
      const current = await provider.getBlockNumber();
      if (lastBlock === null) {
        lastBlock = Math.max(0, current - LOOKBACK_BLOCKS);
      }
      if (current <= lastBlock) return;

      const from = lastBlock + 1;
      const to = current;

      const [paymentEvents, createdEvents, releasedEvents, refundedEvents] = await Promise.all([
        router.queryFilter('PaymentSent', from, to),
        routerEscrow.queryFilter('EscrowCreated', from, to),
        routerEscrow.queryFilter('EscrowReleased', from, to),
        routerEscrow.queryFilter('EscrowRefunded', from, to),
      ]);

      for (const ev of paymentEvents) {
        const [sender, recipient, amount] = ev.args;
        pushPayment({
          txHash: ev.transactionHash,
          from: sender,
          to: recipient,
          amount: ethers.formatEther(amount),
          memo: null,
          status: 'confirmed',
          blockNumber: ev.blockNumber,
          explorerUrl: `${EXPLORER}/tx/${ev.transactionHash}`,
          quantumLayers: { qrng: { ran: false }, vqc: { ran: false }, qaoa: { ran: false }, dilithium: { ran: false } },
        });
      }

      for (const ev of createdEvents) {
        const [id, payer, payee, amount, timeoutSeconds] = ev.args;
        pushEscrow({
          id: id.toString(),
          payer,
          payee,
          amount: ethers.formatEther(amount),
          timeoutSeconds: Number(timeoutSeconds),
          createdAt: Date.now(),
          released: false,
          refunded: false,
          explorerUrl: `${EXPLORER}/tx/${ev.transactionHash}`,
        });
      }

      for (const ev of releasedEvents) updateEscrow(ev.args[0].toString(), { released: true });
      for (const ev of refundedEvents) updateEscrow(ev.args[0].toString(), { refunded: true });

      lastBlock = to;
    } catch (err) {
      console.error('Chain activity poll error:', err.message);
    }
  }

  poll();
  setInterval(poll, POLL_MS);
  console.log(`Chain activity listener polling PaymentSent + Escrow events every ${POLL_MS / 1000}s`);
}

export { startActivityListener };
