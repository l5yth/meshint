// SPDX-License-Identifier: Apache-2.0
// geo.js — pure geo/format helpers for the map (unit-tested).
import { fmtAgo } from "./format.js";

/** Bounding box of nodes with valid coords, or null. */
export function boundsOf(nodes = []) {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity, count = 0;
  for (const n of nodes) {
    const { lat, lon } = n;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    count++;
  }
  return count ? { minLat, minLon, maxLat, maxLon, count } : null;
}

/** "52.1185°N  12.4065°E" from a lat/lon. */
export function fmtLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lon).toFixed(4)}°${
    lon >= 0 ? "E" : "W"
  }`;
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** HTML-escape — popups embed live node-supplied text, so treat it as data. */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Popup HTML for a node. Pure string → unit-testable. */
export function popupHtml(node = {}, nowSec = Math.floor(Date.now() / 1000)) {
  const p = node.proto || {};
  const snrCol = node.snr == null
    ? "var(--cyan-dim)"
    : node.snr > 2
    ? "var(--fg)"
    : node.snr > -3
    ? "var(--amber)"
    : "var(--cyan-dim)";
  const snr = node.snr == null ? "—" : `${node.snr > 0 ? "+" : ""}${node.snr}`;
  const batt = node.batt == null
    ? "—"
    : `${node.batt}%${node.volt != null ? ` / ${node.volt}V` : ""}`;
  const act = node.lastActivity ?? node.lastHeard;
  const seen = act ? fmtAgo(nowSec - act) : "—";
  return `<div class="pp">
    <div class="pp-h" style="color:${p.color || "var(--fg)"}">${
    esc(node.long)
  } <span style="color:var(--fg-dim)">/ ${esc(node.short)}</span></div>
    <div style="color:var(--cyan-dim)">${esc(node.id)}</div>
    <div class="pp-sep"></div>
    <div><span class="pp-k">PROTO </span>${
    esc(p.key || "")
  } &nbsp; <span class="pp-k">ROLE </span>${esc(node.role)}</div>
    <div><span class="pp-k">HW </span>${esc(node.hw)}</div>
    <div><span class="pp-k">SNR </span><span style="color:${snrCol}">${snr}</span> &nbsp; <span class="pp-k">RSSI </span>${
    node.rssi == null ? "—" : node.rssi
  }</div>
    <div><span class="pp-k">BATT </span>${batt} &nbsp; <span class="pp-k">SEEN </span>${seen}</div>
  </div>`;
}
