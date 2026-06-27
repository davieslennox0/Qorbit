// In-memory store for platform subscriptions (Billing/Treasury access).
// Each entry: { subscriber, feature ('billing'|'treasury'), subId, registeredAt, expiresAt }

const store = new Map(); // key = `${subscriber.toLowerCase()}_${feature}`

function key(subscriber, feature) {
  return `${subscriber.toLowerCase()}_${feature}`;
}

export function addPlatformSub({ subscriber, feature, subId, expiresAt }) {
  store.set(key(subscriber, feature), { subscriber, feature, subId, expiresAt, registeredAt: Date.now() });
}

export function removePlatformSub(subscriber, feature) {
  store.delete(key(subscriber, feature));
}

export function getPlatformSub(subscriber, feature) {
  return store.get(key(subscriber, feature)) || null;
}

export function isActivePlatformSub(subscriber, feature) {
  const sub = getPlatformSub(subscriber, feature);
  if (!sub) return false;
  if (sub.expiresAt && sub.expiresAt < Math.floor(Date.now() / 1000)) return false;
  return true;
}
