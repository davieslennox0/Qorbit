import { useEffect, useState } from 'react';
import api, { normalizePayment } from '../api.js';
import TransactionCard from '../components/TransactionCard.jsx';

const inputClass =
  'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Receive() {
  const [agent, setAgent] = useState('');
  const [serviceEndpoint, setServiceEndpoint] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState(null);
  const [registerError, setRegisterError] = useState(null);

  const [watchAddress, setWatchAddress] = useState('');
  const [incoming, setIncoming] = useState([]);

  async function handleRegister(e) {
    e.preventDefault();
    setRegistering(true);
    setRegisterError(null);
    setRegisterResult(null);
    try {
      const res = await api.receive({ agent, serviceEndpoint });
      setRegisterResult(res);
      setWatchAddress(agent);
    } catch (err) {
      setRegisterError(err.message);
    } finally {
      setRegistering(false);
    }
  }

  useEffect(() => {
    if (!watchAddress) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.recentPayments(50);
        if (cancelled) return;
        setIncoming(res.payments.filter((p) => p.to?.toLowerCase() === watchAddress.toLowerCase()));
      } catch {
        // ignore transient poll errors
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watchAddress]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Receive</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Register an agent in the on-chain directory (custodial - the backend relayer registers on your behalf).
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <Field label="Agent address">
          <input className={inputClass} value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x..." required />
        </Field>
        <Field label="Service endpoint">
          <input
            className={inputClass}
            value={serviceEndpoint}
            onChange={(e) => setServiceEndpoint(e.target.value)}
            placeholder="https://my-agent.example/api"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={registering}
          className="w-full rounded-md bg-ink text-white font-medium text-sm py-2.5 hover:opacity-85 disabled:opacity-50"
        >
          {registering ? 'Registering...' : 'Register agent'}
        </button>
      </form>

      {registerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{registerError}</div>
      )}
      {registerResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-mono">
          registered - tx {registerResult.tx_hash?.slice(0, 14)}...
        </div>
      )}

      <div className="space-y-3">
        <Field label="Watch incoming payments to address">
          <input
            className={inputClass}
            value={watchAddress}
            onChange={(e) => setWatchAddress(e.target.value)}
            placeholder="0x..."
          />
        </Field>
        <div className="space-y-2">
          {watchAddress && incoming.length === 0 && (
            <div className="text-sm text-neutral-400">No incoming payments yet for this address.</div>
          )}
          {incoming.map((p) => (
            <TransactionCard key={p.txHash} payment={normalizePayment(p)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Receive;
