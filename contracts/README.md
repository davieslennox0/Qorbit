# contracts

Solidity contracts for Qorbitpay. Built with Foundry, deployed to Arc testnet (chainId `5042002`).

**ERC-8004 compatible** — `QorbitpayRegistry` implements the emerging ERC-8004 standard for
autonomous agent identity on EVM chains, making Qorbitpay interoperable with Vyper agents and
any other Arc ecosystem project that follows the standard.

## Deployed contracts (Arc testnet)

| Contract | Address | Purpose |
|---|---|---|
| `DilithiumVerifier` | `0xca8FbCFb990A77B130939Ec5E0B98e4324fE0c79` | On-chain ML-DSA-44 attestation anchor |
| `QorbitpayRegistry` | `0x3fbCdaD38f40d932A5574562BB72B9115c265093` | ERC-8004 agent identity + reputation (v3) |
| `QorbitpayRouter` | `0xCEe1f311261Ffe460ef5060F94183320e74fD703` | Payments, splits, escrow, batch anchoring |
| `QorbitBilling` | `0xdF87E0c0cfcA0AEa1e899073c36F29Fd865B5e97` | Recurring subscriptions |
| `QorbitTreasury` | `0x7168493186654AD84Ef2dEfb78C773eeCB1BaFC8` | Delegated spending with category + daily caps |

Explorer: `https://testnet.arcscan.app`

## Build

```sh
cd contracts
forge build
```

## Deploy

```sh
forge create src/QorbitBilling.sol:QorbitBilling \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY --broadcast

forge create src/QorbitTreasury.sol:QorbitTreasury \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY --broadcast
```

## Contract summary

### QorbitBilling
Recurring subscription payments. Subscribers deposit a balance; anyone can call `processPayment(subId)` once per period to release funds to the agent. The backend billing cron does this automatically every 60 s.

```solidity
createSubscription(address agent, uint256 amountPerPeriod, uint256 periodSeconds) payable → bytes32 subId
cancelSubscription(bytes32 subId)   // refunds remaining balance
processPayment(bytes32 subId)       // callable by anyone; keeper-friendly
```

### QorbitTreasury
Delegated spending for agent hierarchies. Treasury agents deposit funds and set per-worker daily caps.

Category bitmask: `0x01` = data, `0x02` = compute, `0x04` = storage.

```solidity
deposit() payable
allocateBudget(address worker, uint256 dailyCap, uint256 categoryMask, uint256 expiresAt)
spend(address treasury, uint256 amount, uint256 category)  // called by worker
revokeBudget(address worker)
getBudget(address treasury, address worker) → (remaining, dailyCap, expiresAt, categoryMask, active)
```
