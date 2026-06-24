// SPDX-License-Identifier: Apache-2.0
// map.js — Leaflet phosphor map. SPEC.md §7, D10/D17.
// Markers are Leaflet vector/canvas, so they render even if tiles fail (AC-32).
import { boundsOf, fmtLatLon, popupHtml } from "../geo.js";
import { PROTOCOL_KEYS, PROTOCOLS } from "../model.js";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function validCenter(c) {
  return c && Number.isFinite(c.lat) && Number.isFinite(c.lon);
}

function waitForLeaflet() {
  return new Promise((resolve, reject) => {
    if (globalThis.L) return resolve(globalThis.L);
    let tries = 0;
    const t = globalThis.setInterval(() => {
      if (globalThis.L) {
        globalThis.clearInterval(t);
        resolve(globalThis.L);
      } else if (++tries > 100) {
        globalThis.clearInterval(t);
        reject(new Error("Leaflet (window.L) not available"));
      }
    }, 60);
  });
}

export async function createMap(container, config = {}) {
  const L = await waitForLeaflet();
  container.replaceChildren();
  const mapEl = el("div", "map-leaflet");
  const coords = el("div", "map-coords");
  const legend = el("div", "map-legend");
  container.append(mapEl, coords, legend);

  const hasCenter = validCenter(config.mapCenter);
  const map = L.map(mapEl, {
    preferCanvas: true,
    zoomControl: true,
    attributionControl: true,
    minZoom: 2,
    maxZoom: 18,
  }).setView(
    hasCenter ? [config.mapCenter.lat, config.mapCenter.lon] : [20, 0],
    hasCenter ? 11 : 2,
  );

  L.tileLayer(config.tileUrl || "", {
    subdomains: config.tileSubdomains || "abc",
    attribution: config.tileAttribution || "",
    maxZoom: config.tileMaxZoom || 19,
  }).addTo(map);

  const canvas = L.canvas({ padding: 0.5 });
  const groups = {};
  for (const k of PROTOCOL_KEYS) groups[k] = L.layerGroup().addTo(map);
  const markers = new Map();
  const latest = new Map();
  let activeState = null;
  let fitted = false;

  // Frame by the instance's declared area (center + max distance) when available,
  // so a few far-flung nodes don't zoom the camp cluster into a dot. Falls back to
  // fitting node bounds only when there's no center.
  if (hasCenter && Number.isFinite(config.maxDistanceKm) && config.maxDistanceKm > 0) {
    const lat = config.mapCenter.lat;
    const lon = config.mapCenter.lon;
    const dLat = config.maxDistanceKm / 111;
    const dLon = config.maxDistanceKm / ((111 * Math.cos((lat * Math.PI) / 180)) || 1);
    map.fitBounds([[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]]);
  }
  if (hasCenter) fitted = true;

  function updateCoords() {
    const c = map.getCenter();
    coords.textContent = `${
      fmtLatLon(c.lat, c.lng)
    }  ·  z${map.getZoom()}  ·  ${markers.size} plotted`;
  }
  map.on("move zoom", updateCoords);

  function renderLegend() {
    legend.replaceChildren(el("div", "ml-title", "NODE POSITIONS"));
    for (const k of PROTOCOL_KEYS) {
      const p = PROTOCOLS[k];
      const row = el("div", "ml-row");
      if (activeState && activeState[k] === false) row.style.opacity = "0.35";
      const dot = el("span", "ml-dot");
      dot.style.background = p.color;
      dot.style.boxShadow = `0 0 6px ${p.color}`;
      const label = el("span", "ml-label", p.key);
      label.style.color = p.color;
      row.append(dot, label);
      legend.append(row);
    }
  }

  function groupFor(n) {
    const k = (n.proto && n.proto.key) || PROTOCOL_KEYS[0];
    return groups[k] || groups[PROTOCOL_KEYS[0]];
  }

  function setNodes(nodes = []) {
    const seen = new Set();
    for (const n of nodes) {
      if (n.id == null || n.lat == null || n.lon == null) continue;
      seen.add(n.id);
      latest.set(n.id, n);
      const color = (n.proto && n.proto.color) || "#62b0c4";
      const style = {
        radius: n.online ? 3.6 : 2.4,
        weight: 0,
        color,
        fillColor: color,
        fillOpacity: n.online ? 0.92 : 0.38,
      };
      let m = markers.get(n.id);
      if (!m) {
        m = L.circleMarker([n.lat, n.lon], { renderer: canvas, ...style });
        m.bindPopup(() => popupHtml(latest.get(n.id) || n), { closeButton: true });
        markers.set(n.id, m);
        groupFor(n).addLayer(m);
      } else {
        m.setLatLng([n.lat, n.lon]);
        m.setStyle(style);
      }
    }
    for (const [id, m] of markers) {
      if (!seen.has(id)) {
        for (const k of PROTOCOL_KEYS) groups[k].removeLayer(m);
        markers.delete(id);
        latest.delete(id);
      }
    }
    if (!fitted) {
      const b = boundsOf(nodes);
      if (b) {
        map.fitBounds([[b.minLat, b.minLon], [b.maxLat, b.maxLon]], {
          padding: [28, 28],
          maxZoom: 14,
        });
        fitted = true;
      }
    }
    updateCoords();
  }

  function setActiveProtocols(active) {
    activeState = active || null;
    for (const k of PROTOCOL_KEYS) {
      if (!groups[k]) continue;
      if (active && active[k] === false) map.removeLayer(groups[k]);
      else groups[k].addTo(map);
    }
    renderLegend();
  }

  function focus(node) {
    if (node && node.lat != null && node.lon != null) {
      map.setView([node.lat, node.lon], Math.max(map.getZoom(), 13), { animate: true });
      const m = markers.get(node.id);
      if (m) m.openPopup();
    }
  }

  // Update flash (SPEC.md D28). Canvas markers have no per-marker DOM node to animate, so we
  // project each changed/sender node to a container point and spawn a one-shot CSS ring "ping"
  // that flashes white and fades to the node's protocol color (transform/opacity/color on a
  // separate overlay — no layout reflow, AC-30). Event-driven and self-terminating: NOT looping
  // motion (honors D1/AC-19). Rate-capped so a mass reconcile can't strobe, and every ring
  // auto-removes so nothing accumulates (AC-29).
  const flashLayer = el("div", "map-flash");
  container.append(flashLayer);
  const MAX_FLASH = 16;

  function flash(diff) {
    if (!diff) return;
    const ids = new Set();
    for (const id of diff.nodeIds || []) ids.add(id);
    for (const id of diff.senderIds || []) ids.add(id);
    let spawned = 0;
    for (const id of ids) {
      if (spawned >= MAX_FLASH) break; // cap the burst so the kiosk never strobes
      const n = latest.get(id);
      if (!n || n.lat == null || n.lon == null) continue;
      let pt;
      try {
        pt = map.latLngToContainerPoint([n.lat, n.lon]);
      } catch {
        continue; // map not ready / off-projection — skip this ping
      }
      const ring = el("div", "mf-ring");
      ring.style.left = `${pt.x}px`;
      ring.style.top = `${pt.y}px`;
      // --mf is the protocol color the white flash settles into (see .mf-ring keyframes).
      ring.style.setProperty("--mf", (n.proto && n.proto.color) || "#62b0c4");
      const kill = () => ring.remove();
      ring.addEventListener("animationend", kill, { once: true });
      globalThis.setTimeout(kill, 1400); // safety net if animationend never fires
      flashLayer.append(ring);
      spawned++;
    }
  }

  globalThis.setTimeout(() => map.invalidateSize(), 120);
  globalThis.addEventListener("resize", () => map.invalidateSize());
  renderLegend();
  updateCoords();
  return { map, setNodes, setActiveProtocols, focus, flash };
}
