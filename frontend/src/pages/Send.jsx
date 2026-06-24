import { useState } from 'react';
import api, { normalizePayment } from '../api.js';
import TransactionCard from '../components/TransactionCard.jsx';

const DEFAULT_FRAUD = { amount_zscore: 0, agent_age_days: 365, tx_frequency: 1, dispute_rate: 0 };

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink';

function Send() {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [memo, setMemo] = useState('');
  const [showFraud, setShowFraud] = useState(false);
  const [fraud, setFraud] = useState(DEFAULT_FRAUD);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = { to, amount, memo: memo || undefined };
      if (showFraud) body.fraudSignals = fraud;
      const res = await api.pay(body);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Send</h1>
        <p className="text-neutral-500 text-sm mt-1">Settles via Qorbitpay's router contract on Arc, with all 4 quantum layers.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <Field label="To address">
          <input className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x..." required />
        </Field>
        <Field label="Amount (USDC)">
          <input
            className={inputClass}
            type="number"
            step="0.0001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Memo (optional)">
          <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="service" />
        </Field>

        <button
          type="button"
          onClick={() => setShowFraud((v) => !v)}
          className="text-xs text-ink hover:underline"
        >
          {showFraud ? 'hide' : 'show'} fraud signal overrides (VQC)
        </button>

        {showFraud && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface-2 p-3">
            {Object.keys(DEFAULT_FRAUD).map((key) => (
              <Field key={key} label={key}>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  value={fraud[key]}
                  onChange={(e) => setFraud((f) => ({ ...f, [key]: Number(e.target.value) }))}
                />
              </Field>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-ink text-white font-medium text-sm py-2.5 hover:opacity-85 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send payment'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Result</h2>
          <TransactionCard payment={normalizePayment(result)} />
        </div>
      )}
    </div>
  );
}

export default Send;
