// In-memory registry of subscription IDs known to this backend instance.
// Populated when subscribers use POST /api/billing/subscribe.
// Used by the billing cron to know which subIds to check for processPayment.

const subs = new Map(); // subId -> { subId, subscriber, agent, amountPerPeriod, periodSeconds, createdAt }

function addSub(record) {
  subs.set(record.subId, { ...record });
}

function removeSub(subId) {
  subs.delete(subId);
}

function getAllSubs() {
  return Array.from(subs.values());
}

function getSub(subId) {
  return subs.get(subId) || null;
}

function getSubsByAgent(agentAddress) {
  const lower = agentAddress.toLowerCase();
  return Array.from(subs.values()).filter((s) => s.agent?.toLowerCase() === lower);
}

function getSubsBySubscriber(subscriberAddress) {
  const lower = subscriberAddress.toLowerCase();
  return Array.from(subs.values()).filter((s) => s.subscriber?.toLowerCase() === lower);
}

export { addSub, removeSub, getAllSubs, getSub, getSubsByAgent, getSubsBySubscriber };
