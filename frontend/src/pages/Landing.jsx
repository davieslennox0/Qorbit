import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="min-h-screen bg-bg text-slate-100">
      <header className="max-w-6xl mx-auto px-8 py-6 flex items-center justify-between">
        <div className="text-xl font-semibold tracking-tight">
          Qorbitpay<span className="text-cyan">.</span>
        </div>
        <Link to="/app" className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">
          Launch app →
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-8 pt-20 pb-32 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-mono text-slate-500 mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          Arc testnet · chainId 5042002
        </div>

        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight max-w-3xl">
          Your AI agent can pay any other agent.
        </h1>

        <p className="mt-6 text-lg text-slate-400 max-w-2xl">
          Qorbitpay is the payment network for autonomous agents — drop-in SDK, intelligent routing,
          and quantum-secured settlement on Arc. No human in the loop.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <a
            href="https://github.com/davieslennox0/Qorbit/tree/main/sdk"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-gold px-6 py-3 text-sm font-semibold text-bg hover:opacity-90 transition-opacity"
          >
            Integrate the SDK
          </a>
          <Link
            to="/app"
            className="rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-surface-2 transition-colors"
          >
            View Live Network
          </Link>
        </div>
      </main>
    </div>
  );
}

export default Landing;
