import { useEffect, useState } from 'react';
import api, { normalizePayment, buildAgentLabels } from '../api.js';
import NetworkGraph from '../components/NetworkGraph.jsx';
import TransactionCard from '../components/TransactionCard.jsx';

const POLL_MS = 4000;
const MAX_TRANSACTIONS_SHOWN = 10;

function StatBlock({ label, value }) {
  return (
    <div className="flex-1 px-6 py-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const [agentsRes, paymentsRes] = await Promise.all([api.agents(0, 100), api.recentPayments(50)]);
        if (cancelled) return;
        setAgents(agentsRes.agents);
        setPayments(paymentsRes.payments);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const labels = buildAgentLabels(agents);
  const totalVolume = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const quantumCoverage = payments.length
    ? Math.round(
        (100 *
          payments.filter((p) => p.quantumLayers?.vqc?.ran && p.quantumLayers?.qrng?.ran && p.quantumLayers?.dilithium?.ran)
            .length) /
          payments.length
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <p className="text-neutral-500 text-sm mt-1">Live agent network on Arc testnet</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex divide-x divide-border rounded-lg border border-border bg-surface">
        <StatBlock label="Agents" value={agents.length} />
        <StatBlock label="Recent payments" value={payments.length} />
        <StatBlock label="Recent volume" value={`${totalVolume.toFixed(4)} USDC`} />
        <StatBlock label="Quantum coverage" value={`${quantumCoverage}%`} />
      </div>

      <NetworkGraph agents={agents} payments={payments} labels={labels} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Recent transactions</h2>
          {payments.length > 0 && (
            <span className="text-xs text-neutral-400">
              showing {Math.min(payments.length, MAX_TRANSACTIONS_SHOWN)} of {payments.length}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {payments.length === 0 && <div className="text-sm text-neutral-400">No payments yet.</div>}
          {payments.slice(0, MAX_TRANSACTIONS_SHOWN).map((p) => (
            <TransactionCard key={p.txHash} payment={normalizePayment(p)} labels={labels} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
