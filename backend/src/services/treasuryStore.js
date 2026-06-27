// In-memory registry of budget allocations known to this backend instance.
// Populated via POST /api/treasury/allocate.

const budgets = new Map(); // `${treasury}:${worker}` -> record

function key(treasury, worker) {
  return `${treasury.toLowerCase()}:${worker.toLowerCase()}`;
}

function addBudget(record) {
  budgets.set(key(record.treasury, record.worker), { ...record });
}

function removeBudget(treasury, worker) {
  budgets.delete(key(treasury, worker));
}

function getBudget(treasury, worker) {
  return budgets.get(key(treasury, worker)) || null;
}

function getBudgetsForTreasury(treasury) {
  const lower = treasury.toLowerCase();
  return Array.from(budgets.values()).filter((b) => b.treasury?.toLowerCase() === lower);
}

function getBudgetsForWorker(worker) {
  const lower = worker.toLowerCase();
  return Array.from(budgets.values()).filter((b) => b.worker?.toLowerCase() === lower);
}

export { addBudget, removeBudget, getBudget, getBudgetsForTreasury, getBudgetsForWorker };
