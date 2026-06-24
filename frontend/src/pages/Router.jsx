import { useState } from 'react';
import api from '../api.js';
import { QuantumBadge } from '../components/QuantumBadge.jsx';

const DEFAULT_PROVIDERS = [
  { id: 'providerA', price: 0.02, latency: 120, reputation: 900 },
  { id: 'providerB', price: 0.01, latency: 300, reputation: 700 },
  { id: 'providerC', price: 0.05, latency: 50, reputation: 950 },
  { id: 'providerD', price: 0.008, latency: 400, reputation: 500 },
];

const inputClass =
  'w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan/50';

function RouterPage() {
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function updateProvider(idx, key, value) {
    setProviders((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  }

  function addProvider() {
    setProviders((prev) => [...prev, { id: `provider${prev.length + 1}`, price: 0.02, latency: 100, reputation: 800 }]);
  }

  function removeProvider(idx) {
    setProviders((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const cleaned = providers.map((p) => ({
        id: p.id,
        price: Number(p.price),
        latency: Number(p.latency),
        reputation: Number(p.reputation),
      }));
      const res = await api.route(cleaned);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Router</h1>
          <p className="text-slate-500 text-sm mt-1">QAOA picks the optimal agent service provider.</p>
        </div>
        <QuantumBadge label="QAOA" active title="quantum approximate optimization" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="pb-2">id</th>
              <th className="pb-2">price</th>
              <th className="pb-2">latency (ms)</th>
              <th className="pb-2">reputation</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="space-y-1">
            {providers.map((p, idx) => (
              <tr key={idx}>
                <td className="pr-2 py-1">
                  <input className={inputClass} value={p.id} onChange={(e) => updateProvider(idx, 'id', e.target.value)} />
                </td>
                <td className="pr-2 py-1">
                  <input
                    className={inputClass}
                    type="number"
                    step="0.001"
                    value={p.price}
                    onChange={(e) => updateProvider(idx, 'price', e.target.value)}
                  />
                </td>
                <td className="pr-2 py-1">
                  <input
                    className={inputClass}
                    type="number"
                    value={p.latency}
                    onChange={(e) => updateProvider(idx, 'latency', e.target.value)}
                  />
                </td>
                <td className="pr-2 py-1">
                  <input
                    className={inputClass}
                    type="number"
                    value={p.reputation}
                    onChange={(e) => updateProvider(idx, 'reputation', e.target.value)}
                  />
                </td>
                <td className="py-1">
                  <button type="button" onClick={() => removeProvider(idx)} className="text-slate-600 hover:text-red-400 text-xs">
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button type="button" onClick={addProvider} className="text-xs text-cyan hover:underline">
          + add provider
        </button>

        <button
          type="submit"
          disabled={loading || providers.length === 0}
          className="w-full rounded-md bg-gold text-black font-medium text-sm py-2.5 hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Optimizing...' : 'Find optimal route'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-3 font-mono text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">optimal_route</span>
            <span className="text-gold text-lg">{result.optimal_route}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">quantum_cost</span>
            <span>{result.quantum_cost}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">classical_cost</span>
            <span>{result.classical_cost}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">savings_pct</span>
            <span className="text-cyan">{result.savings_pct}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">selection_confidence</span>
            <span>{result.selection_confidence}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">matched_classical_optimum</span>
            <span>{String(result.matched_classical_optimum)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouterPage;
