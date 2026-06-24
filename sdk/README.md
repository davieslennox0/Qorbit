# qorbitpay-sdk

Payments SDK for autonomous AI agents on [Qorbitpay](https://github.com/), running on Arc
(Circle's L1 testnet, chainId `5042002`, native gas token USDC).

```bash
npm install qorbitpay-sdk
```

## Quickstart

```js
import { Qorbitpay } from 'qorbitpay-sdk';

const q = new Qorbitpay({ privateKey: process.env.AGENT_KEY });

// send a payment (self-sovereign - signed and broadcast with your own wallet)
await q.pay({ to: '0xAgent', amount: 0.01, memo: 'service' });

// listen for incoming payments
const unsubscribe = q.receive({
  onPayment: (tx) => fulfillService(tx),
});
```

Fund your agent's wallet at the [Circle faucet](https://faucet.circle.com) (select Arc
Testnet) before sending payments.

## Why no custodial relayer here

Qorbitpay's hosted backend (`POST /api/pay`) is a *custodial* relayer that adds QRNG-anchored
nonces, VQC fraud screening, QAOA-based provider routing, and Dilithium2 (post-quantum)
dual-signing with on-chain attestation for higher-value payments. This SDK instead talks
directly to the on-chain contracts with your agent's own key - lighter weight, no
custodial trust required, and all you need for the base protocol (sending/receiving
native-token payments, registering in the agent directory).

`checkFraud()` and `findRoute()` below call the *same* quantum services the hosted backend
uses, over HTTP, for agents that want those signals without running Qiskit themselves -
pass `apiUrl` pointing at a Qorbitpay backend deployment to use them.

## API

### `new Qorbitpay(options)`

| option | required | default | description |
|---|---|---|---|
| `privateKey` | yes | - | your agent's wallet private key |
| `rpcUrl` | no | Arc testnet RPC | |
| `chainId` | no | `5042002` | |
| `routerAddress` | no | deployed QorbitpayRouter | |
| `registryAddress` | no | deployed QorbitpayRegistry | |
| `apiUrl` | no | `null` | base URL of a Qorbitpay backend, required for `checkFraud`/`findRoute` |

### `await q.pay({ to, amount, memo })`
Sends `amount` (native token units, string or number) to `to`. `memo` is hashed
(keccak256) on-chain. Returns `{ txHash, status, blockNumber, explorerUrl, ... }`.

### `q.receive({ onPayment })`
Subscribes to incoming `PaymentSent` events addressed to your agent. Returns an
`unsubscribe()` function.

### `await q.register({ serviceEndpoint })`
Registers your agent (self-sovereign: owner == agent == your wallet) in the on-chain
agent directory.

### `await q.getAgent(address?)` / `await q.getReputation(address?)`
Reads from the agent directory. Defaults to your own address.

### `await q.getBalance()`
Native token balance of your agent's wallet, formatted as a string.

### `await q.checkFraud({ amount_zscore, agent_age_days, tx_frequency, dispute_rate })`
VQC (variational quantum circuit) fraud score via a Qorbitpay backend. Requires `apiUrl`.

### `await q.findRoute(providers)`
QAOA-optimal pick among `providers: [{ id, price, latency, reputation }, ...]` via a
Qorbitpay backend. Requires `apiUrl`.
