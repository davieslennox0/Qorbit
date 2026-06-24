import { ethers } from 'ethers';
import { routerContract } from './contracts.js';
import { pushPayment } from './recentPayments.js';

const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';

/// recentPayments (the dashboard's data source) is normally populated only by the custodial
/// POST /api/pay route handler, so self-sovereign payments made directly on-chain via the SDK
/// (an agent's own key, no relayer involved) would otherwise be invisible on the dashboard even
/// though they're real settled transactions. This listens to the router's PaymentSent event
/// directly and records every payment regardless of who sent it. Custodial payments get pushed
/// twice (once here, once from payments.js with full quantum_layers metadata) - recentPayments
/// dedupes by txHash, so whichever push lands first wins; the route handler's richer record
/// normally wins the race since it pushes before this listener's tx.wait() confirms.
function startActivityListener() {
  const router = routerContract();

  router.on('PaymentSent', (from, to, amount, memoHash, event) => {
    const log = event?.log ?? event;
    pushPayment({
      txHash: log.transactionHash,
      from,
      to,
      amount: ethers.formatEther(amount),
      memo: null,
      status: 'confirmed',
      blockNumber: log.blockNumber,
      explorerUrl: `${EXPLORER}/tx/${log.transactionHash}`,
      quantumLayers: {
        qrng: { ran: false },
        vqc: { ran: false },
        qaoa: { ran: false },
        dilithium: { ran: false },
      },
    });
  });

  console.log('Chain activity listener watching PaymentSent on the router contract');
}

export { startActivityListener };
