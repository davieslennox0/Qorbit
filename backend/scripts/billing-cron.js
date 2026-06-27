// Billing cron: calls POST /api/billing/process-due every 60 seconds.
// pm2 keeps this running; the backend must be up first.
import 'dotenv/config';

const API = process.env.BACKEND_URL || 'http://localhost:3001';
const INTERVAL_MS = Number(process.env.BILLING_INTERVAL_MS || 60_000);

async function tick() {
  try {
    const res = await fetch(`${API}/api/billing/process-due`, { method: 'POST' });
    if (!res.ok) {
      console.warn(`billing cron: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const acted = data.results?.filter((r) => !r.skipped) ?? [];
    if (acted.length > 0) {
      console.log(`billing cron: processed ${acted.length} subscription(s)`, acted);
    } else {
      console.log('billing cron: no subscriptions due');
    }
  } catch (err) {
    console.error('billing cron error:', err.message);
  }
}

tick();
setInterval(tick, INTERVAL_MS);
