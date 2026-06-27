import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';

const LAYERS = [
  {
    id: 'qrng',
    label: '01 — QRNG',
    title: 'True quantum randomness',
    body: 'Every payment is anchored by a quantum random nonce, sourced live and Merkle-batched on-chain for tamper-proof replay protection.',
  },
  {
    id: 'vqc',
    label: '02 — VQC',
    title: 'Quantum fraud detection',
    body: 'A 4-qubit variational circuit scores every payment for risk before it settles. Flagged transactions are blocked, not refunded after the fact.',
  },
  {
    id: 'qaoa',
    label: '03 — QAOA',
    title: 'Quantum-optimized routing',
    body: 'Given a list of candidate providers, a depth-2 QAOA circuit picks the optimal route on price, latency, and reputation — provably, not heuristically.',
  },
  {
    id: 'dilithium',
    label: '04 — PQ',
    title: 'Post-quantum signatures',
    body: 'Every payment is dual-signed with ML-DSA-44 (Dilithium2) alongside ECDSA, with high-value transfers attested on-chain.',
  },
];

function StatBlock({ value, label }) {
  return (
    <div className="border-l border-border pl-5">
      <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-neutral-500">{label}</div>
    </div>
  );
}

function Landing() {
  const [stats, setStats] = useState({ agents: null, payments: null, volume: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, p] = await Promise.all([api.agents(0, 1), api.recentPayments(200)]);
        if (cancelled) return;
        const volume = p.payments.reduce((sum, pmt) => sum + Number(pmt.amount || 0), 0);
        setStats({ agents: a.total, payments: p.payments.length, volume });
      } catch {
        // landing page works fine with no live numbers if the API is briefly unreachable
      }
    }
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="font-display text-lg font-semibold tracking-tight">Qorbitpay</div>
          <nav className="flex items-center gap-8 text-sm font-medium text-neutral-600">
            <a
              href="https://github.com/davieslennox0/Qorbit"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink transition-colors"
            >
              GitHub
            </a>
            <Link to="/app" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-85 transition-opacity">
              Launch app
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-8 pt-24 pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-mono text-neutral-500 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" />
            Live on Arc testnet — chainId 5042002
          </div>

          <h1 className="font-display text-5xl md:text-6xl font-semibold tracking-tight max-w-3xl leading-[1.05]">
            Your AI agent can pay any other agent.
          </h1>

          <p className="mt-6 text-lg text-neutral-600 max-w-xl leading-relaxed">
            Qorbitpay is the payment network for autonomous agents — drop-in SDK, intelligent
            routing, and quantum-secured settlement on Arc. No human in the loop.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a
              href="https://github.com/davieslennox0/Qorbit/tree/main/sdk"
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-85 transition-opacity text-center"
            >
              Integrate the SDK
            </a>
            <Link
              to="/app"
              className="rounded-md border border-ink px-6 py-3 text-sm font-semibold text-ink hover:bg-surface-2 transition-colors text-center"
            >
              View Live Network
            </Link>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="max-w-6xl mx-auto px-8 py-10 grid grid-cols-2 md:grid-cols-5 gap-8">
            <StatBlock value={stats.agents ?? '—'} label="Agents registered" />
            <StatBlock value={stats.payments ?? '—'} label="Payments settled" />
            <StatBlock
              value={stats.volume != null ? `${stats.volume.toFixed(2)} USDC` : '—'}
              label="Total volume processed"
            />
            <StatBlock value="4" label="Quantum layers / payment" />
            <StatBlock value="<2s" label="Median settlement" />
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-8 py-24">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Four layers, every payment</h2>
            <p className="mt-3 text-neutral-600">
              Not optional add-ons — every <code className="font-mono text-sm bg-surface-2 rounded px-1.5 py-0.5">POST /api/pay</code> call
              runs all four and reports exactly what ran.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-2 gap-px bg-border border border-border rounded-lg overflow-hidden">
            {LAYERS.map((layer) => (
              <div key={layer.id} className="bg-surface p-8">
                <div className="font-mono text-xs text-neutral-500 tracking-wide">{layer.label}</div>
                <h3 className="mt-3 font-display text-lg font-semibold">{layer.title}</h3>
                <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{layer.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-ink text-white">
          <div className="max-w-6xl mx-auto px-8 py-20 flex flex-col items-center text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight max-w-2xl">
              Three lines of code. Any agent, any framework.
            </h2>
            <pre className="mt-8 rounded-lg bg-white/5 border border-white/15 px-6 py-5 text-sm font-mono text-left overflow-x-auto">
{`import { Qorbitpay } from 'qorbitpay-sdk'

const q = new Qorbitpay({ privateKey: process.env.AGENT_KEY })
await q.pay({ to: '0xAgent', amount: 0.01, memo: 'data analysis' })`}
            </pre>
            <Link
              to="/app"
              className="mt-10 rounded-md bg-white px-6 py-3 text-sm font-semibold text-ink hover:opacity-85 transition-opacity"
            >
              View Live Network →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-8 py-8 flex items-center justify-between text-sm text-neutral-500">
          <div>Qorbitpay — built on Arc testnet</div>
          <a
            href="https://github.com/davieslennox0/Qorbit"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink transition-colors"
          >
            github.com/davieslennox0/Qorbit
          </a>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
