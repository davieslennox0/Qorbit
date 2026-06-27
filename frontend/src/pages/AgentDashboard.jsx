import { useEffect, useState, useCallback } from 'react';
import api, { normalizePayment } from '../api.js';
import { QuantumBadgeRow } from '../components/QuantumBadge.jsx';

const POLL_MS = 8000;
const CAT_LABELS = { 1: 'data', 2: 'compute', 4: 'storage', 7: 'all' };

function shortAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortAgentId(id) {
  if (!id) return '—';
  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - Number(timestamp)) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toLocaleDateString();
}

function SummaryCard({ label, value, mono = false }) {
  return (
    <div className="flex-1 px-5 py-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${mono ? 'font-mono' : 'font-display'}`}>
        {value}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active ? 'bg-ink text-white' : 'text-neutral-600 hover:text-ink hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

function WalletConnect({ onConnect }) {
  const [error, setError] = useState(null);

  async function connect() {
    setError(null);
    if (!window.ethereum) {
      setError('No wallet found — install MetaMask to continue.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      onConnect(accounts[0]);
    } catch (err) {
      setError(err.message || 'Wallet connection rejected.');
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="text-neutral-400 text-sm">Connect your wallet to view your agent dashboard</div>
      <button
        onClick={connect}
        className="rounded-md bg-ink text-white px-5 py-2.5 text-sm font-semibold hover:opacity-85 transition-opacity"
      >
        Connect wallet
      </button>
      {error && <div className="text-red-600 text-sm">{error}</div>}
    </div>
  );
}

function TransactionRow({ tx, address }) {
  const direction = tx.to?.toLowerCase() === address?.toLowerCase() ? 'in' : 'out';
  const layers = tx.quantumLayers || {};
  const vqcScore = layers.vqc?.fraud_score;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
            {direction === 'in' ? '↓ in' : '↑ out'}
          </span>
          <span className="font-mono text-neutral-700 text-xs">{shortAddr(direction === 'in' ? tx.from : tx.to)}</span>
          <span className="font-mono font-semibold">{tx.amount} USDC</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
          {tx.status && <span className={tx.status === 'confirmed' ? 'text-emerald-600' : 'text-red-600'}>{tx.status}</span>}
          {tx.timestamp && <span>{timeAgo(tx.timestamp)}</span>}
          {vqcScore !== undefined && (
            <span title={`VQC fraud score: ${vqcScore}`} className={Number(vqcScore) >= 0.7 ? 'text-red-500' : 'text-neutral-400'}>
              fraud: {Number(vqcScore).toFixed(3)}
            </span>
          )}
          {tx.explorerUrl && (
            <a href={tx.explorerUrl} target="_blank" rel="noreferrer" className="hover:text-ink">
              explorer ↗
            </a>
          )}
        </div>
      </div>
      <QuantumBadgeRow layers={layers} />
    </div>
  );
}

function BillingTab({ address, summary }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ agent: '', amountPerPeriod: '', period: '7d', initialBalance: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await api.billingSubscriptionsBy(address);
      setSubs(res.subscriptions || []);
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  async function handleSubscribe(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.billingSubscribe({ ...form, subscriber: address });
      await load();
      setForm({ agent: '', amountPerPeriod: '', period: '7d', initialBalance: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(subId) {
    try {
      await api.billingCancel(subId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-medium text-sm">New subscription</h3>
        </div>
        <form onSubmit={handleSubscribe} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Agent address</label>
              <input
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="0x..."
                value={form.agent}
                onChange={(e) => setForm((f) => ({ ...f, agent: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Amount per period (USDC)</label>
              <input
                type="number"
                step="0.001"
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="0.05"
                value={form.amountPerPeriod}
                onChange={(e) => setForm((f) => ({ ...f, amountPerPeriod: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Period (e.g. 7d, 24h)</label>
              <input
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="7d"
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Initial balance (USDC)</label>
              <input
                type="number"
                step="0.001"
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="0.50"
                value={form.initialBalance}
                onChange={(e) => setForm((f) => ({ ...f, initialBalance: e.target.value }))}
              />
            </div>
          </div>
          {error && <div className="text-red-600 text-xs">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-ink text-white px-4 py-2 text-sm font-medium hover:opacity-85 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create subscription'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-surface divide-y divide-border">
        <div className="px-5 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Active subscriptions</div>
        {loading && <div className="px-5 py-4 text-sm text-neutral-400">Loading…</div>}
        {!loading && subs.length === 0 && (
          <div className="px-5 py-4 text-sm text-neutral-400">No subscriptions yet.</div>
        )}
        {subs.map((s) => (
          <div key={s.subId} className="px-5 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-mono text-xs text-neutral-700">{shortAddr(s.agent)}</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {s.amountPerPeriod} USDC / {s.periodSeconds ? `${Math.round(s.periodSeconds / 86400)}d` : '?'}
              </div>
            </div>
            <button
              onClick={() => handleCancel(s.subId)}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Cancel
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreasuryTab({ address }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ worker: '', dailyCap: '', categoryMask: 7, expiresAt: '', depositAmount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await api.treasuryInfo(address);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  async function handleAllocate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.treasuryAllocate({ treasury: address, ...form });
      await load();
      setForm({ worker: '', dailyCap: '', categoryMask: 7, expiresAt: '', depositAmount: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(worker) {
    try {
      await api.treasuryRevoke({ treasury: address, worker });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const catLabel = (mask) => {
    const parts = [];
    if (mask & 0x01) parts.push('data');
    if (mask & 0x02) parts.push('compute');
    if (mask & 0x04) parts.push('storage');
    return parts.join(' + ') || 'none';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-sm">Allocate budget to worker</h3>
          {data?.chainBalance != null && (
            <span className="text-xs font-mono text-neutral-500">
              treasury balance: {Number(data.chainBalance).toFixed(6)} USDC
            </span>
          )}
        </div>
        <form onSubmit={handleAllocate} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Worker agent address</label>
              <input
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="0x..."
                value={form.worker}
                onChange={(e) => setForm((f) => ({ ...f, worker: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Daily cap (USDC)</label>
              <input
                type="number"
                step="0.001"
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="0.10"
                value={form.dailyCap}
                onChange={(e) => setForm((f) => ({ ...f, dailyCap: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Categories</label>
              <div className="mt-1 flex gap-2">
                {[['data', 0x01], ['compute', 0x02], ['storage', 0x04]].map(([name, bit]) => (
                  <label key={name} className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.categoryMask & bit)}
                      onChange={(e) => setForm((f) => ({ ...f, categoryMask: e.target.checked ? f.categoryMask | bit : f.categoryMask & ~bit }))}
                      className="accent-ink"
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Expires (unix timestamp)</label>
              <input
                type="number"
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder={String(Math.floor(Date.now() / 1000) + 86400 * 30)}
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Deposit amount (USDC)</label>
              <input
                type="number"
                step="0.001"
                className="mt-1 w-full rounded border border-border px-3 py-1.5 text-sm font-mono bg-surface-2 focus:outline-none focus:border-ink"
                placeholder="1.00"
                value={form.depositAmount}
                onChange={(e) => setForm((f) => ({ ...f, depositAmount: e.target.value }))}
              />
            </div>
          </div>
          {error && <div className="text-red-600 text-xs">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-ink text-white px-4 py-2 text-sm font-medium hover:opacity-85 disabled:opacity-50"
          >
            {submitting ? 'Allocating…' : 'Allocate budget'}
          </button>
        </form>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-surface divide-y divide-border">
          <div className="px-5 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Budgets you allocated</div>
          {loading && <div className="px-5 py-4 text-sm text-neutral-400">Loading…</div>}
          {!loading && (data?.budgetsAllocated ?? []).length === 0 && (
            <div className="px-5 py-4 text-sm text-neutral-400">None yet.</div>
          )}
          {(data?.budgetsAllocated ?? []).map((b) => (
            <div key={b.worker} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs text-neutral-700">{shortAddr(b.worker)}</div>
                <button onClick={() => handleRevoke(b.worker)} className="text-xs text-red-600 hover:text-red-800 font-medium">Revoke</button>
              </div>
              <div className="mt-1 text-xs text-neutral-500 space-y-0.5">
                <div>daily cap: <span className="font-mono">{b.dailyCap} USDC</span></div>
                <div>categories: {catLabel(b.categoryMask)}</div>
                <div>expires: {formatDate(b.expiresAt)}</div>
                {b.remaining != null && (
                  <div>remaining today: <span className="font-mono">{Number(b.remaining).toFixed(6)} USDC</span></div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface divide-y divide-border">
          <div className="px-5 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Budgets allocated to you</div>
          {loading && <div className="px-5 py-4 text-sm text-neutral-400">Loading…</div>}
          {!loading && (data?.budgetsReceived ?? []).length === 0 && (
            <div className="px-5 py-4 text-sm text-neutral-400">None yet.</div>
          )}
          {(data?.budgetsReceived ?? []).map((b) => (
            <div key={`${b.treasury}-${b.worker}`} className="px-5 py-3">
              <div className="font-mono text-xs text-neutral-700">from {shortAddr(b.treasury)}</div>
              <div className="mt-1 text-xs text-neutral-500 space-y-0.5">
                <div>daily cap: <span className="font-mono">{b.dailyCap} USDC</span></div>
                <div>categories: {catLabel(b.categoryMask)}</div>
                <div>expires: {formatDate(b.expiresAt)}</div>
                {b.remaining != null && (
                  <div>remaining today: <span className="font-mono">{Number(b.remaining).toFixed(6)} USDC</span></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentDashboard() {
  const [address, setAddress] = useState(null);
  const [tab, setTab] = useState('transactions');
  const [summary, setSummary] = useState(null);
  const [txs, setTxs] = useState([]);
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Listen for account changes in the connected wallet
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = (accounts) => setAddress(accounts[0] || null);
    window.ethereum.on('accountsChanged', onAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', onAccountsChanged);
  }, []);

  const loadAgentData = useCallback(async () => {
    if (!address) return;
    try {
      const [summaryRes, txRes, escrowRes] = await Promise.all([
        api.agentSummary(address),
        api.agentTransactions(address),
        api.agentEscrows(address),
      ]);
      setSummary(summaryRes);
      setTxs(txRes.transactions || []);
      setEscrows(escrowRes.escrows || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    loadAgentData().finally(() => setLoading(false));
    const id = setInterval(loadAgentData, POLL_MS);
    return () => clearInterval(id);
  }, [address, loadAgentData]);

  if (!address) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Agent</h1>
          <p className="text-neutral-500 text-sm mt-1">Per-agent transaction history, billing, and treasury.</p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Agent</h1>
          <p className="font-mono text-xs text-neutral-500 mt-1">{address}</p>
        </div>
        <button
          onClick={() => setAddress(null)}
          className="text-xs text-neutral-400 hover:text-ink border border-border rounded px-2 py-1"
        >
          Disconnect
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {summary && (
        <div className="flex divide-x divide-border rounded-lg border border-border bg-surface">
          <SummaryCard label="Balance" value={`${Number(summary.balance).toFixed(6)} USDC`} mono />
          <SummaryCard label="Total earned" value={`${summary.totalEarned} USDC`} mono />
          <SummaryCard label="Total spent" value={`${summary.totalSpent} USDC`} mono />
          <SummaryCard
            label="Reputation"
            value={summary.agent?.registered ? summary.agent.reputation : '—'}
            mono
          />
        </div>
      )}

      {summary?.agent?.registered && (
        <div className="rounded-lg border border-border bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-neutral-500">Registered agent</span>
                {summary.agent.erc8004 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    ERC-8004 Verified
                  </span>
                )}
              </div>
              {summary.agent.agentId && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-neutral-400">Agent ID</span>
                  <span
                    className="font-mono text-xs text-neutral-700 cursor-pointer hover:text-ink"
                    title={summary.agent.agentId}
                    onClick={() => navigator.clipboard?.writeText(summary.agent.agentId)}
                  >
                    {shortAgentId(summary.agent.agentId)}
                  </span>
                </div>
              )}
              {summary.agent.name && summary.agent.name !== 'Agent' && (
                <div className="mt-0.5 text-sm font-medium">{summary.agent.name}</div>
              )}
              {summary.agent.serviceEndpoint && (
                <div className="mt-0.5 font-mono text-xs text-neutral-400">{summary.agent.serviceEndpoint}</div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className={`px-2 py-0.5 rounded-full font-mono ${summary.agent.active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                {summary.agent.active ? 'active' : 'inactive'}
              </span>
              <span className="text-neutral-400">rep {summary.agent.reputation}</span>
              {summary.agent.trustScore != null && (
                <span className="text-neutral-400">trust {summary.agent.trustScore}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-border pb-0">
        <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>
          Transactions
        </TabButton>
        <TabButton active={tab === 'billing'} onClick={() => setTab('billing')}>
          Billing
        </TabButton>
        <TabButton active={tab === 'treasury'} onClick={() => setTab('treasury')}>
          Treasury
        </TabButton>
      </div>

      {tab === 'transactions' && (
        <div className="space-y-4">
          {escrows.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3">
              <div className="text-xs font-medium text-amber-700 mb-2">Active escrows ({escrows.length})</div>
              <div className="space-y-1">
                {escrows.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs font-mono text-amber-800">
                    <span>
                      {e.payer?.toLowerCase() === address.toLowerCase() ? `→ ${shortAddr(e.payee)}` : `← ${shortAddr(e.payer)}`}
                    </span>
                    <span>{e.amount} USDC locked</span>
                    <span>timeout {Math.round(e.timeoutSeconds / 3600)}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface divide-y divide-border">
            {loading && txs.length === 0 && (
              <div className="px-4 py-8 text-sm text-neutral-400 text-center">Loading…</div>
            )}
            {!loading && txs.length === 0 && (
              <div className="px-4 py-12 text-center">
                <div className="text-sm text-neutral-400">No transactions yet — integrate the SDK to start.</div>
                <pre className="mt-4 inline-block text-left text-xs font-mono bg-surface-2 rounded-lg px-4 py-3">
{`import { Qorbitpay } from 'qorbitpay-sdk'
const q = new Qorbitpay({ privateKey: AGENT_KEY })
await q.pay({ to: '0xAgent', amount: 0.01 })`}
                </pre>
              </div>
            )}
            {txs.map((tx) => (
              <TransactionRow key={tx.txHash} tx={tx} address={address} />
            ))}
          </div>
        </div>
      )}

      {tab === 'billing' && <BillingTab address={address} summary={summary} />}
      {tab === 'treasury' && <TreasuryTab address={address} />}
    </div>
  );
}

export default AgentDashboard;
