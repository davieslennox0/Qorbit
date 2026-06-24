const MAX_SIZE = Number(process.env.RECENT_PAYMENTS_SIZE || 50);

let buffer = [];

function pushPayment(record) {
  if (record.txHash && buffer.some((p) => p.txHash === record.txHash)) return;
  buffer.unshift({ ...record, timestamp: Date.now() });
  if (buffer.length > MAX_SIZE) buffer.length = MAX_SIZE;
}

function getRecent(limit = MAX_SIZE) {
  return buffer.slice(0, limit);
}

export { pushPayment, getRecent };
