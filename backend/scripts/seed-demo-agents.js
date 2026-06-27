import 'dotenv/config';
import { ethers } from 'ethers';
import { getWallet, withWalletLock, EXPLORER } from '../src/services/arc-chain.js';
import { registryContract } from '../src/services/contracts.js';
import fs from 'fs';

/// Seeds 8 demo agents into QorbitpayRegistry for video/demo purposes. Generates a fresh
/// wallet per agent (these are just identities to register - they don't need funding,
/// since registration is custodial: our relayer wallet pays gas and registers them).
/// Private keys are written to demo-agents.local.json (gitignored) only so they can be
/// reused later (e.g. to send them a demo payment) - not because they're meaningful
/// secrets; these wallets hold no funds.
const DEMO_AGENTS = [
  { name: 'translation-agent',     version: '1.0.0', serviceEndpoint: 'https://translation-agent.demo/api' },
  { name: 'weather-oracle-agent',  version: '1.0.0', serviceEndpoint: 'https://weather-oracle.demo/api' },
  { name: 'image-gen-agent',       version: '1.0.0', serviceEndpoint: 'https://image-gen-agent.demo/api' },
  { name: 'code-review-agent',     version: '1.0.0', serviceEndpoint: 'https://code-review-agent.demo/api' },
  { name: 'market-analysis-agent', version: '1.0.0', serviceEndpoint: 'https://market-analysis-agent.demo/api' },
  { name: 'data-pipeline-agent',   version: '1.0.0', serviceEndpoint: 'https://data-pipeline-agent.demo/api' },
  { name: 'audit-agent',           version: '1.0.0', serviceEndpoint: 'https://audit-agent.demo/api' },
  { name: 'summarizer-agent',      version: '1.0.0', serviceEndpoint: 'https://summarizer-agent.demo/api' },
];

async function main() {
  const wallet = getWallet();
  const registry = registryContract(wallet);
  const results = [];

  for (const demo of DEMO_AGENTS) {
    const agentWallet = ethers.Wallet.createRandom();
    console.log(`Registering ${demo.name} -> ${agentWallet.address} ...`);

    const identity = {
      owner: agentWallet.address,
      name: demo.name,
      version: demo.version,
      serviceEndpoint: demo.serviceEndpoint,
      capabilityHash: ethers.ZeroHash,
      registeredAt: 0,
      active: true,
    };

    const tx = await withWalletLock((nonce) =>
      registry.registerAgent(identity, { nonce })
    );
    const receipt = await tx.wait();

    let agentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = registry.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'AgentRegistered') { agentId = parsed.args.agentId; break; }
      } catch { /* ignore */ }
    }

    console.log(`  agentId ${agentId} | tx ${tx.hash} (block ${receipt.blockNumber})`);
    console.log(`  ${EXPLORER}/tx/${tx.hash}`);

    results.push({
      name: demo.name,
      agentId,
      address: agentWallet.address,
      privateKey: agentWallet.privateKey,
      serviceEndpoint: demo.serviceEndpoint,
      txHash: tx.hash,
    });
  }

  const outPath = new URL('./demo-agents.local.json', import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} demo agents to ${outPath.pathname}`);
}

main().catch((err) => {
  console.error('seed-demo-agents failed:', err);
  process.exit(1);
});
