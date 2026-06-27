// In-memory store of on-chain escrows observed via the EscrowCreated event.
// Populated by chainActivityListener. Keyed by escrow id (string).
const MAX_SIZE = Number(process.env.ESCROW_STORE_SIZE || 200);

let escrows = []; // [{id, payer, payee, amount, createdAt, timeoutSeconds, released, refunded, explorerUrl}]

function pushEscrow(record) {
  const key = String(record.id);
  if (escrows.some((e) => String(e.id) === key)) return;
  escrows.unshift({ ...record });
  if (escrows.length > MAX_SIZE) escrows.length = MAX_SIZE;
}

function updateEscrow(id, patch) {
  const e = escrows.find((e) => String(e.id) === String(id));
  if (e) Object.assign(e, patch);
}

function getEscrowsByParty(address) {
  const lower = address.toLowerCase();
  return escrows.filter(
    (e) => e.payer?.toLowerCase() === lower || e.payee?.toLowerCase() === lower
  );
}

export { pushEscrow, updateEscrow, getEscrowsByParty };
