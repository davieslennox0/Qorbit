import { useEffect, useState } from 'react';
import api, { normalizePayment } from '../api.js';
import NetworkGraph from '../components/NetworkGraph.jsx';
import TransactionCard from '../components/TransactionCard.jsx';

const POLL_MS = 4000;

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-2xl font-mono font-semibold ${accent || 'text-slate-100'}`}>{value}</div>
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
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Live agent network on Arc testnet</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Agents" value={agents.length} />
        <StatCard label="Recent payments" value={payments.length} />
        <StatCard label="Recent volume" value={`${totalVolume.toFixed(4)} USDC`} accent="text-gold" />
        <StatCard label="Quantum coverage" value={`${quantumCoverage}%`} accent="text-cyan" />
      </div>

      <NetworkGraph agents={agents} payments={payments} />

      <div>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Recent transactions</h2>
        <div className="space-y-2">
          {payments.length === 0 && <div className="text-sm text-slate-600">No payments yet.</div>}
          {payments.map((p) => (
            <TransactionCard key={p.txHash} payment={normalizePayment(p)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
