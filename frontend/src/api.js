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

export { normalizePayment };
export default api;
