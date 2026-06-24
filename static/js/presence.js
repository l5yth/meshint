// SPDX-License-Identifier: Apache-2.0
// presence.js — online/presence computation. SPEC.md D15.
// A node is "online" if its most recent ACTIVITY is within `windowSec`, where
// activity = the later of its node last_heard OR its most recent message rx_time.
// (MeshCore nodes seldom send adverts/telemetry, so chat traffic must count.)

export const ONLINE_WINDOW_SEC = 48 * 60 * 60; // 48h (>24h) (SPEC.md D15)

/** Map of sender node id → latest message rx_time (seconds). */
export function latestMessageBySender(messages = []) {
  const m = new Map();
  for (const msg of messages) {
    const id = msg.fromId ?? msg.nodeId;
    const t = msg.rxTime;
    if (id == null || t == null) continue;
    const prev = m.get(id);
    if (prev === undefined || t > prev) m.set(id, t);
  }
  return m;
}

/** Annotate nodes with lastActivity + online; return { nodes, onlineCount }. */
export function computePresence(nodes = [], messages = [], nowSec, windowSec = ONLINE_WINDOW_SEC) {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const msgLatest = latestMessageBySender(messages);
  let onlineCount = 0;
  const annotated = nodes.map((n) => {
    const msgT = msgLatest.get(n.id);
    const lastActivity = Math.max(n.lastHeard ?? 0, msgT ?? 0);
    const online = lastActivity > 0 && (now - lastActivity) <= windowSec;
    if (online) onlineCount++;
    return { ...n, lastActivity, online };
  });
  return { nodes: annotated, onlineCount };
}
