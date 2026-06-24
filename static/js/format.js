// SPDX-License-Identifier: Apache-2.0
// format.js — pure presentation helpers (unit-tested).

/** Thousands-separated integer, or "—" for non-finite input. */
export function fmtCount(n) {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

/** Rate with 2 decimals (small values), thousands-grouped integer once ≥ 100. */
export function fmtRate(n) {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);
}

/** Compact age (5s / 12m / 3h / 2d) from a seconds delta. */
export function fmtAgo(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** UTC HH:MM:SS from a Date or epoch-ms. */
export function fmtClock(d) {
  const date = d instanceof Date ? d : new Date(d ?? Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())} UTC`;
}

/** Stable status-ticker items from store state (SPEC.md §7, D11). */
export function buildTickerItems(state) {
  const cfg = state.config || {};
  const items = [];
  items.push(
    state.status === "live"
      ? "SYS NOMINAL"
      : state.status === "degraded"
      ? "SYS DEGRADED — RETRYING"
      : "SYS CONNECTING",
  );
  items.push(`FEDERATION SYNC ${(state.instances || []).length} INSTANCES`);
  if (cfg.siteName) items.push(String(cfg.siteName).toUpperCase());
  if (cfg.frequency) items.push(`LORA ${cfg.frequency}`);
  if (cfg.channel) items.push(`CH ${cfg.channel}`);
  const topCh = (state.channels || [])[0];
  if (topCh) items.push(`TOP CHANNEL ${topCh.name}`);
  return items;
}
