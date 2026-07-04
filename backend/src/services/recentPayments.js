import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
let buffer = [];
try {
  if (fs.existsSync(PAYMENTS_FILE)) {
    buffer = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    console.log(`recentPayments: loaded ${buffer.length} payments from disk`);
  }
} catch (err) {
  console.error('recentPayments: failed to load from disk:', err.message);
  buffer = [];
}

let writeTimer = null;
function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(buffer));
    } catch (err) {
      console.error('recentPayments: failed to persist to disk:', err.message);
    }
  }, 2000);
}

function pushPayment(record) {
  if (record.txHash && buffer.some((p) => p.txHash === record.txHash)) return;
  buffer.unshift({ ...record, timestamp: Date.now() });
  scheduleWrite();
}

function getRecent(limit) {
  return limit ? buffer.slice(0, limit) : buffer.slice();
}

function getStats() {
  const totalVolume = buffer.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { count: buffer.length, totalVolume };
}

export { pushPayment, getRecent, getStats };
