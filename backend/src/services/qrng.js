import crypto from 'crypto';

const QRNG_URL = 'https://qrng.anu.edu.au/API/jsonI.php';
const MIN_INTERVAL_MS = 61_000; // ANU QRNG free tier: 1 request/min
const POOL_REFILL_SIZE = 64; // hex16 blocks of 16 bytes each, fetched in one request
const POOL_LOW_WATERMARK = 8;

let pool = [];
let lastFetchAt = 0;
let refillInFlight = null;

async function fetchFromAnu(length) {
  const url = `${QRNG_URL}?length=${length}&type=hex16&size=16`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success !== true || !Array.isArray(body.data)) {
    throw new Error(`ANU QRNG request failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

function refillPool() {
  if (refillInFlight) return refillInFlight;
  if (Date.now() - lastFetchAt < MIN_INTERVAL_MS) return null; // respect rate limit, skip silently
  refillInFlight = (async () => {
    try {
      lastFetchAt = Date.now();
      const data = await fetchFromAnu(POOL_REFILL_SIZE);
      pool.push(...data.map((hex) => ({ nonce: hex.toLowerCase(), source: 'anu_qrng', fetchedAt: Date.now() })));
    } catch (err) {
      console.error('QRNG pool refill failed:', err.message);
    } finally {
      refillInFlight = null;
    }
  })();
  return refillInFlight;
}

/// Returns a 16-byte hex nonce. Prefers true quantum randomness from the ANU QRNG API
/// (pooled, since the free tier is rate-limited to 1 request/min); falls back to
/// crypto.randomBytes when the pool is empty and a refill isn't allowed yet, with the
/// fallback clearly flagged via `source` so callers/clients can tell the two apart.
async function getQuantumNonce() {
  if (pool.length <= POOL_LOW_WATERMARK) {
    refillPool();
  }
  if (pool.length > 0) {
    return pool.shift();
  }
  return { nonce: crypto.randomBytes(16).toString('hex'), source: 'csprng_fallback', fetchedAt: Date.now() };
}

function poolStatus() {
  return { size: pool.length, lastFetchAt };
}

function warmPool() {
  return refillPool();
}

export { getQuantumNonce, poolStatus, warmPool };
