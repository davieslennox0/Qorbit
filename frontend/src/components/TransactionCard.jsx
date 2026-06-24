import { QuantumBadgeRow } from './QuantumBadge.jsx';

function shortAddr(addr) {
  if (!addr) return '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/// payment: normalized shape from src/api.js's normalizePayment().
function TransactionCard({ payment }) {
  const statusColor =
    payment.status === 'confirmed' ? 'text-emerald-600' : payment.status === 'failed' ? 'text-red-600' : 'text-neutral-500';

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="text-neutral-700">{shortAddr(payment.from)}</span>
          <span className="text-neutral-400">&rarr;</span>
          <span className="text-neutral-700">{shortAddr(payment.to)}</span>
          <span className="text-ink font-semibold ml-2">{payment.amount} USDC</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
          <span className={statusColor}>{payment.status}</span>
          {payment.memo && <span className="truncate">memo: {payment.memo}</span>}
          {payment.timestamp && <span>{timeAgo(payment.timestamp)}</span>}
          {payment.explorerUrl && (
            <a
              href={payment.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink hover:underline"
            >
              explorer ↗
            </a>
          )}
        </div>
      </div>
      <QuantumBadgeRow layers={payment.quantumLayers} />
    </div>
  );
}

export default TransactionCard;
