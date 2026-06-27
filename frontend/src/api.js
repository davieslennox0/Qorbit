const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `${path} failed with status ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  pay: (body) => request('/pay', { method: 'POST', body: JSON.stringify(body) }),
  receive: (body) => request('/receive', { method: 'POST', body: JSON.stringify(body) }),
  agents: (offset = 0, limit = 50) => request(`/agents?offset=${offset}&limit=${limit}`),
  recentPayments: (limit = 50) => request(`/payments/recent?limit=${limit}`),
  fraud: (body) => request('/fraud', { method: 'POST', body: JSON.stringify(body) }),
  route: (providers) => request('/route', { method: 'POST', body: JSON.stringify({ providers }) }),
  arcStatus: () => request('/arc/status'),
  // Agent dashboard
  agentSummary: (address) => request(`/agent/${address}/summary`),
  agentTransactions: (address) => request(`/agent/${address}/transactions`),
  agentEscrows: (address) => request(`/agent/${address}/escrows`),
  // Billing
  billingSubscribe: (body) => request('/billing/subscribe', { method: 'POST', body: JSON.stringify(body) }),
  billingCancel: (subId) => request('/billing/cancel', { method: 'POST', body: JSON.stringify({ subId }) }),
  billingSubscriptions: (agentAddress) => request(`/billing/subscriptions/${agentAddress}`),
  billingSubscriptionsBy: (subscriberAddress) => request(`/billing/subscriptions-by/${subscriberAddress}`),
  // Treasury
  treasuryAllocate: (body) => request('/treasury/allocate', { method: 'POST', body: JSON.stringify(body) }),
  treasurySpend: (body) => request('/treasury/spend', { method: 'POST', body: JSON.stringify(body) }),
  treasuryRevoke: (body) => request('/treasury/revoke', { method: 'POST', body: JSON.stringify(body) }),
  treasuryInfo: (address) => request(`/treasury/${address}`),
};

// POST /api/pay returns snake_case fields; GET /api/payments/recent returns camelCase.
// Normalize either shape to one consistent object for display components.
function normalizePayment(raw) {
  if (!raw) return null;
  return {
    txHash: raw.txHash || raw.tx_hash,
    from: raw.from,
    to: raw.to,
    amount: raw.amount,
    memo: raw.memo,
    status: raw.status,
    blockNumber: raw.blockNumber ?? raw.block_number,
    explorerUrl: raw.explorerUrl || raw.arc_explorer_url,
    quantumLayers: raw.quantumLayers || raw.quantum_layers || {},
    timestamp: raw.timestamp ?? null,
  };
}

// ERC-8004 agents carry an explicit `name` field; fall back to the hostname of the
// serviceEndpoint for older registrations. Falls back to null (caller shows short address).
function agentLabel(agent) {
  if (agent?.name && agent.name !== 'Agent') return agent.name;
  if (!agent?.serviceEndpoint) return null;
  try {
    return new URL(agent.serviceEndpoint).hostname.split('.')[0];
  } catch {
    return null;
  }
}

function buildAgentLabels(agents = []) {
  const map = {};
  for (const agent of agents) {
    const label = agentLabel(agent);
    // ERC-8004 agents use `owner` as their payment address (replaces old `address` field).
    const addr = agent.owner || agent.address;
    if (label && addr) map[addr.toLowerCase()] = label;
  }
  return map;
}

export { normalizePayment, buildAgentLabels };
export default api;
