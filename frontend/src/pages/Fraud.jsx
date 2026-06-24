import { useState } from 'react';
import api from '../api.js';
import { QuantumBadge } from '../components/QuantumBadge.jsx';

const SLIDERS = [
  { key: 'amount_zscore', label: 'amount z-score', min: -3, max: 3, step: 0.1, default: 0 },
  { key: 'agent_age_days', label: 'agent age (days)', min: 0, max: 400, step: 1, default: 365 },
  { key: 'tx_frequency', label: 'tx frequency (per hr)', min: 0, max: 100, step: 1, default: 1 },
  { key: 'dispute_rate', label: 'dispute rate', min: 0, max: 1, step: 0.01, default: 0 },
];

function Fraud() {
  const [signals, setSignals] = useState(() =>
    SLIDERS.reduce((acc, s) => ({ ...acc, [s.key]: s.default }), {})
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.fraud(signals);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const score = result?.fraud_score ?? 0;
  const scoreColor = score >= 0.7 ? '#f87171' : score >= 0.4 ? '#f5a623' : '#34d399';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fraud</h1>
          <p className="text-slate-500 text-sm mt-1">VQC fraud scoring playground.</p>
        </div>
        <QuantumBadge label="VQC" active title="variational quantum circuit" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-border bg-surface p-5">
        {SLIDERS.map((s) => (
          <div key={s.key}>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{s.label}</span>
              <span className="font-mono text-slate-300">{signals[s.key]}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={signals[s.key]}
              onChange={(e) => setSignals((sig) => ({ ...sig, [s.key]: Number(e.target.value) }))}
              className="w-full accent-gold"
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gold text-black font-medium text-sm py-2.5 hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Scoring...' : 'Run fraud check'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>fraud_score</span>
              <span className="font-mono" style={{ color: scoreColor }}>
                {result.fraud_score}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${score * 100}%`, background: scoreColor }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between font-mono text-sm">
            <span className="text-slate-500">flagged</span>
            <span className={result.flagged ? 'text-red-400' : 'text-emerald-400'}>{String(result.flagged)}</span>
          </div>
          <div className="flex items-center justify-between font-mono text-sm">
            <span className="text-slate-500">confidence</span>
            <span>{result.confidence}</span>
          </div>
          <div className="flex items-center justify-between font-mono text-sm">
            <span className="text-slate-500">qubits</span>
            <span>{result.qubits}</span>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">z_expectations</div>
            <div className="flex gap-2 font-mono text-xs">
              {result.z_expectations?.map((z, i) => (
                <span key={i} className="rounded bg-surface-2 px-2 py-1 text-slate-300">
                  q{i}: {z.toFixed(3)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Fraud;
