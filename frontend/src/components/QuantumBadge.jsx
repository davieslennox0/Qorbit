const BADGE_ORDER = [
  { key: 'qaoa', label: 'QAOA' },
  { key: 'vqc', label: 'VQC' },
  { key: 'qrng', label: 'QRNG' },
  { key: 'dilithium', label: 'PQ' },
];

function badgeTitle(key, data) {
  if (!data || !data.ran) return 'did not run for this payment';
  switch (key) {
    case 'qaoa':
      return data.optimal_route
        ? `routed to ${data.optimal_route} (${data.savings_pct}% savings)`
        : 'ran (no provider list given)';
    case 'vqc':
      return `fraud_score ${data.fraud_score} - ${data.flagged ? 'flagged' : 'clear'}`;
    case 'qrng':
      return `nonce source: ${data.source}`;
    case 'dilithium':
      return data.attested ? `${data.algorithm}, attested on-chain` : `${data.algorithm}, signed`;
    default:
      return '';
  }
}

function QuantumBadge({ label, active, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium tracking-wide transition-colors ${
        active
          ? 'border-ink bg-ink text-white'
          : 'border-border bg-surface-2 text-neutral-400'
      }`}
    >
      {label}
    </span>
  );
}

/// Renders the QAOA / VQC / QRNG / PQ pill row for a payment's quantum_layers object.
function QuantumBadgeRow({ layers = {} }) {
  return (
    <div className="flex gap-1.5">
      {BADGE_ORDER.map(({ key, label }) => (
        <QuantumBadge
          key={key}
          label={label}
          active={Boolean(layers[key]?.ran)}
          title={badgeTitle(key, layers[key])}
        />
      ))}
    </div>
  );
}

export { QuantumBadge, QuantumBadgeRow };
