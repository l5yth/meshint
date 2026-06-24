// SPDX-License-Identifier: Apache-2.0
// stats.js — derived counters, rates, and breakdowns from normalized data. SPEC.md §6.
import { PROTOCOL_KEYS } from "./model.js";

const DAY_SEC = 24 * 60 * 60;

/** Count items whose `field` timestamp is within `sinceSec` of `nowSec`. */
export function countSince(items, nowSec, sinceSec, field = "rxTime") {
  const cutoff = nowSec - sinceSec;
  let c = 0;
  for (const it of items) {
    const t = it[field];
    if (t != null && t >= cutoff) c++;
  }
  return c;
}

/** All packet timestamps — messages + telemetry — for the rate and sparkline. */
export function packetTimes({ messages = [], telemetry = [] } = {}) {
  const t = [];
  for (const m of messages) if (m.rxTime != null) t.push(m.rxTime);
  for (const x of telemetry) if (x.rxTime != null) t.push(x.rxTime);
  return t;
}

/** Packets per hour, averaged over a trailing window (default 24h → typical hourly traffic). */
export function computePacketRate(times = [], nowSec, windowSec = 24 * 3600) {
  const cutoff = nowSec - windowSec;
  let n = 0;
  for (const t of times) if (t != null && t >= cutoff) n++;
  return (n * 3600) / windowSec;
}

/** Per-hour packet counts over the last `hours` (index 0 = oldest, last = newest). */
export function packetSeriesPerHour(times = [], nowSec, hours = 24) {
  const bins = new Array(hours).fill(0);
  for (const t of times) {
    if (t == null) continue;
    const ago = nowSec - t;
    if (ago < 0 || ago >= hours * 3600) continue;
    bins[hours - 1 - Math.floor(ago / 3600)]++;
  }
  return bins;
}

/** The five top-bar counters (SPEC.md §6). */
export function computeCounters(
  { nodes = [], messages = [], telemetry = [], onlineCount = 0, nowSec } = {},
) {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  return {
    nodes: nodes.length,
    online: onlineCount,
    msgs24h: countSince(messages, now, DAY_SEC),
    telemetry: countSince(telemetry, now, DAY_SEC),
    pktPerHr: computePacketRate(packetTimes({ messages, telemetry }), now),
  };
}

/** Mesh health as the percentage of nodes online (replaces the mockup's invented %). */
export function meshHealthPct(counters = {}) {
  const { online = 0, nodes = 0 } = counters;
  return nodes > 0 ? (online / nodes) * 100 : 0;
}

/** Node counts per protocol (rail fleet breakdown). Reticulum stays present at 0. */
export function computeFleetBreakdown(nodes = []) {
  const counts = {};
  for (const k of PROTOCOL_KEYS) counts[k] = 0;
  for (const n of nodes) {
    const k = n.proto && n.proto.key;
    if (!k) continue;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

/** Channel activity, busiest first (rail channels). */
export function computeChannels(messages = []) {
  const counts = new Map();
  for (const m of messages) {
    const name = m.channelName || `ch${m.channel ?? "?"}`;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
