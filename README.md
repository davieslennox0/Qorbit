# Qorbitpay

Your AI agent needs to pay other agents. Right now that means you're in the loop —
managing wallets, authorizing transfers, handling receipts. Qorbitpay removes you
entirely.

Any agent. Any framework. Three lines of code.

**[qorbitpay.xyz](https://qorbitpay.xyz)** — [npm: qorbitpay-sdk](https://www.npmjs.com/package/qorbitpay-sdk) — [GitHub](https://github.com/davieslennox0/Qorbit)

```js
import { Qorbitpay } from 'qorbitpay-sdk'

const q = new Qorbitpay({ privateKey: process.env.AGENT_KEY })

await q.pay({ to: '0xAgent', amount: 0.01, memo: 'data analysis' })
```

Built on Arc (Circle's stablecoin-native L1 testnet). Every payment runs through four
quantum-computing layers: true quantum randomness, quantum fraud detection,
quantum-optimized routing, and post-quantum signatures.

## Structure

- `backend/` — Node.js + Express API (port 3001): payments, agent directory, x402, the 4 quantum layers
- `frontend/` — React + Tailwind dashboard (Vite)
- `sdk/` — [`qorbitpay-sdk`](https://www.npmjs.com/package/qorbitpay-sdk), the agent-facing payments client (published on npm)
- `quantum-services/` — Python: VQC fraud detection + QAOA routing (Qiskit Aer), spawned per-request by the backend
- `contracts/` — Solidity (Foundry): QorbitpayRouter, QorbitpayRegistry, DilithiumVerifier

## Arc testnet

- RPC: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`
- Gas token: native USDC
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com` (select Arc Testnet)

## Deployed contracts

| Contract | Address | Explorer |
|---|---|---|
| QorbitpayRouter | `0xCEe1f311261Ffe460ef5060F94183320e74fD703` | [view](https://testnet.arcscan.app/address/0xCEe1f311261Ffe460ef5060F94183320e74fD703) |
| QorbitpayRegistry | `0x8C0E962FcA17930BDB829Cf2E03F7B3b16138968` | [view](https://testnet.arcscan.app/address/0x8C0E962FcA17930BDB829Cf2E03F7B3b16138968) |
| DilithiumVerifier | `0xca8FbCFb990A77B130939Ec5E0B98e4324fE0c79` | [view](https://testnet.arcscan.app/address/0xca8FbCFb990A77B130939Ec5E0B98e4324fE0c79) |

Full deployment record (tx hashes, ABIs context): `contracts/deployments/arc-testnet.json`.

## The four quantum layers

Every `POST /api/pay` response includes a `quantum_layers` object showing exactly what ran:

1. **QRNG** — true quantum random nonces from the ANU QRNG API (pooled for its 1 req/min
   free-tier limit, with a CSPRNG fallback clearly flagged via `source`). Anchors each
   payment's memo hash and doubles as the post-quantum authorization's anti-replay nonce.
   Batches of nonces are SHA-256 Merkle-rooted and anchored on-chain via `Router.anchorBatch`.
2. **VQC (fraud detection)** — a 4-qubit variational circuit (Qiskit + `AerSimulator`)
   scores `amount_zscore`, `agent_age_days`, `tx_frequency`, `dispute_rate`. Flagged
   payments are blocked (HTTP 403) before touching the chain. See `quantum-services/quantum/vqc.py`.
3. **QAOA (routing)** — given a list of candidate providers (price/latency/reputation),
   picks the optimal one with a depth-2 QAOA circuit. Uses a Hamming-weight-preserving
   ring-XY mixer (not a penalty-term QUBO) so the search never leaves the "exactly one
   provider selected" subspace - this is what makes it reliably hit the true optimum at
   such shallow depth. See `quantum-services/quantum/qaoa.py`.
4. **Dilithium2 (post-quantum signing)** — every payment is dual-signed: ECDSA (the
   relayer's existing key) + ML-DSA-44/Dilithium2 via `@noble/post-quantum` (audited, pure
   JS - not `liboqs-node`, which is unmaintained and needs a native build). Payments above
   `PQ_ATTESTATION_THRESHOLD` (default 0.10 USDC) get the verification result published
   on-chain via `DilithiumVerifier.attestSignature`. See `backend/src/middleware/pq-signing.js`.

`DilithiumVerifier.sol` is an **attestation registry**, not an on-chain lattice-math
verifier - ML-DSA verification needs NTT/rejection-sampling arithmetic that isn't feasible
inside the EVM today. The standard real-world pattern (used here) is: verify off-chain
with an audited implementation, then have an authorized attestor publish the result
on-chain as a replay-protected commitment. See the NatSpec in the contract for the full
reasoning.

## Getting started

```bash
# backend
cd backend && cp .env.example .env && npm install
node src/services/arc-chain.js generate   # creates a test wallet, fund it via the faucet
npm run dev                               # http://localhost:3001

# quantum-services (used by the backend via python-shell)
cd quantum-services && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173

# seed 5 demo agents into the registry (optional, for demos)
cd backend && node scripts/seed-demo-agents.js
```

## SDK quickstart

```bash
npm install qorbitpay-sdk
```

```js
import { Qorbitpay } from 'qorbitpay-sdk';

const q = new Qorbitpay({ privateKey: process.env.AGENT_KEY });

await q.pay({ to: '0xAgent', amount: 0.01, memo: 'service' });

q.receive({ onPayment: (tx) => fulfillService(tx) });
```

The SDK talks directly to the on-chain contracts with the agent's own key (self-sovereign
- no custodial relayer). `checkFraud()`/`findRoute()` call the same quantum services the
hosted backend uses, over HTTP, for agents that want those signals without running Qiskit
themselves. See `sdk/README.md` for the full API.

## Agent discovery (A2A)

`GET /.well-known/agent.json` serves an A2A (Agent2Agent protocol) AgentCard describing
Qorbitpay's skills (`pay`, `receive`, `agents`, `fraud-check`, `route`) and its x402
payment requirement, so other agents can discover and integrate with Qorbitpay
programmatically.

## Deployment

- `ecosystem.config.js` — pm2 config for the backend + quantum-services health process:
  `pm2 start ecosystem.config.js` from the repo root.
- `Caddyfile` — reverse proxy: `/api/*` and `/.well-known/*` to the backend, everything
  else to the built frontend (`frontend/dist`, SPA fallback to `index.html`). Replace the
  `REPLACE_WITH_DOMAIN` placeholder with your real domain before running.
