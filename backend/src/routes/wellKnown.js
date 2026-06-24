import express from 'express';
import { CHAIN_ID, EXPLORER } from '../services/arc-chain.js';

const router = express.Router();

const PQ_ATTESTATION_THRESHOLD = Number(process.env.PQ_ATTESTATION_THRESHOLD || 0.10);

/// GET /.well-known/agent.json - A2A (Agent2Agent) AgentCard describing Qorbitpay's
/// skills. `url` is derived from the actual request rather than hardcoded, so this stays
/// correct in dev, behind a reverse proxy, or once a real domain is attached.
router.get('/agent.json', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    name: 'Qorbitpay',
    description:
      'Payment infrastructure for autonomous AI agents on Arc (Circle\'s L1 testnet, ' +
      `chainId ${CHAIN_ID}, native USDC gas). Exposes on-chain payments and an agent ` +
      'directory, plus four quantum-computing services: QRNG nonces, VQC fraud ' +
      'detection, QAOA provider routing, and Dilithium2 (post-quantum, FIPS 204 ML-DSA-44) ' +
      'payment attestation.',
    url: `${baseUrl}/api`,
    provider: {
      organization: 'Qorbitpay',
      url: baseUrl,
    },
    version: '0.1.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    securitySchemes: {
      x402: {
        type: 'http',
        scheme: 'x402',
        description:
          'HTTP 402 Payment Required (coinbase/x402 "exact" scheme). Send an X-PAYMENT ' +
          'header (base64-encoded JSON authorization) to pay for a metered skill; ' +
          'settlement runs through QorbitpayRouter on Arc rather than EIP-3009 ' +
          'transferWithAuthorization, since Arc\'s USDC is the chain\'s native gas token, ' +
          'not an ERC-20.',
      },
    },
    skills: [
      {
        id: 'pay',
        name: 'Send payment',
        description:
          'Send a native-token (USDC) payment to another agent on Arc. Runs all four ' +
          'quantum layers: QRNG nonce anchoring, VQC fraud screening (blocks if flagged), ' +
          'optional QAOA provider routing when multiple candidate payees are given, and ' +
          `Dilithium2 dual-signing (on-chain attested above ${PQ_ATTESTATION_THRESHOLD} USDC).`,
        tags: ['payments', 'x402', 'arc'],
        examples: ['pay 0.01 USDC to agent 0x... for a completed task'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'receive',
        name: 'Register as payee',
        description: 'Custodial registration of an agent in the on-chain QorbitpayRegistry directory.',
        tags: ['agents', 'directory'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'agents',
        name: 'Agent directory lookup',
        description: 'Paginated read of registered agents (service endpoint, reputation, status).',
        tags: ['agents', 'directory'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'fraud-check',
        name: 'VQC fraud score',
        description:
          'Scores a payment for fraud risk using a 4-qubit variational quantum circuit ' +
          '(Qiskit Aer), given amount z-score, agent age, tx frequency, and dispute rate.',
        tags: ['quantum', 'vqc', 'fraud'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'route',
        name: 'QAOA provider routing',
        description:
          'Picks the optimal agent service provider from a candidate list (price, latency, ' +
          'reputation) using a depth-2 QAOA circuit with a Hamming-weight-preserving mixer.',
        tags: ['quantum', 'qaoa', 'routing'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
    links: {
      explorer: EXPLORER,
    },
  });
});

export default router;
