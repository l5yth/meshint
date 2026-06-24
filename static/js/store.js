// SPDX-License-Identifier: Apache-2.0
// store.js — the meshint state store. SPEC.md §5, D8/D9/D15, D23/D25/D27.
// Single source of truth: fetches via the injected api client, normalizes, computes
// presence + counters, and notifies subscribers. Transport-agnostic — the app composes
// it with a transport (polling or the SSE event stream), so the store never knows how it
// is driven (AC-37). `refresh()` refetches everything; `applyChange(collections)` refetches
// only the collections an /api/events change names and diffs them, emitting *what changed*
// on an additive change channel (subscribeChanges) so the UI can flash updates (D27/D28).
// On fetch error it degrades but keeps last-known data (AC-31).
import {
  normalizeInstance,
  normalizeMessage,
  normalizeNode,
  normalizeTelemetry,
  normalizeVersion,
} from "./model.js";
import { computePresence } from "./presence.js";
import { computeChannels, computeCounters, computeFleetBreakdown } from "./stats.js";

const DAY_SEC = 24 * 60 * 60;

/** Bare host of a URL or domain (no scheme/path), lowercased. */
export function hostOf(url) {
  return String(url || "").replace(/^[a-z]+:\/\//i, "").replace(/[/?#].*$/, "").toLowerCase();
}

function nowSec(clock) {
  return Math.floor((clock ? clock() : Date.now()) / 1000);
}

/** Merge incremental messages newest-first, dedupe by id, cap the buffer. */
export function mergeMessages(existing, incoming, limit) {
  const byId = new Map();
  for (const m of incoming) if (m.id != null) byId.set(m.id, m);
  for (const m of existing) if (m.id != null && !byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (b.rxTime ?? 0) - (a.rxTime ?? 0)).slice(0, limit);
}

export function createStore({ apiClient, clock, messageBufferLimit = 5000 } = {}) {
  const listeners = new Set();
  const changeListeners = new Set(); // additive "what changed" channel (D27) — drives flashes
  let state = {
    status: "connecting", // connecting | live | degraded
    config: null,
    nodes: [],
    messages: [],
    telemetry: [],
    instances: [],
    counters: { nodes: 0, online: 0, msgs24h: 0, telemetry: 0, pktPerHr: 0 },
    fleet: {},
    channels: [],
    lastUpdated: null,
    lastError: null,
  };
  let lastRxTime = 0;
  let populated = false; // suppress the flash on the very first populate (D28)
  // Canonical normalized buffers; all derived state is recomputed from these, so a single
  // collection can be refetched (applyChange) without refetching the rest.
  const raw = { nodes: [], messages: [], telemetry: [], instances: [] };

  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  }

  /** Additive diff channel: fn({ nodeIds, messageIds, senderIds }) on each live change. */
  function subscribeChanges(fn) {
    changeListeners.add(fn);
    return () => changeListeners.delete(fn);
  }

  function emitChange(diff) {
    for (const fn of changeListeners) fn(diff);
  }

  async function deriveConfig() {
    // /version often lacks CORS cross-origin; derive from the CORS-friendly
    // /api/instances self-entry instead (SPEC.md D8 resilience).
    const host = hostOf(apiClient.apiBase);
    let self = null;
    try {
      const list = (await apiClient.instances()) || [];
      self = list.map(normalizeInstance).find((i) => hostOf(i.domain) === host) || null;
    } catch {
      // ignore — fall through to host-only defaults
    }
    return {
      name: (self && self.name) || host || "mesh",
      version: "",
      lastNodeUpdate: null,
      siteName: (self && self.name) || "",
      channel: (self && self.channel) || "",
      frequency: (self && self.frequency) || "",
      contactLink: "",
      contactUrl: "",
      refreshIntervalSec: 60,
      mapCenter: { lat: self ? self.lat : null, lon: self ? self.lon : null },
      maxDistanceKm: null,
      instanceDomain: host,
      privateMode: false,
      source: self ? "instances" : "default",
    };
  }

  async function loadConfig() {
    // Prefer /version (richest: cadence, private_mode, max_distance). It lacks CORS
    // on some instances cross-origin, so fall back to the instances self-entry (D8).
    try {
      const config = { ...normalizeVersion(await apiClient.version()), source: "version" };
      set({ config });
      return config;
    } catch {
      const config = await deriveConfig();
      set({ config });
      return config;
    }
  }

  /** Node ids whose marker should flash: newly appeared, moved, re-heard, or online flipped. */
  function diffNodes(prevNodes, nextNodes) {
    const prev = new Map();
    for (const n of prevNodes) if (n.id != null) prev.set(n.id, n);
    const ids = [];
    for (const n of nextNodes) {
      if (n.id == null) continue;
      const p = prev.get(n.id);
      if (!p) {
        ids.push(n.id); // newly appeared
      } else if (
        p.lat !== n.lat || p.lon !== n.lon ||
        (p.lastActivity ?? 0) !== (n.lastActivity ?? 0) || p.online !== n.online
      ) {
        ids.push(n.id); // moved, re-heard, or online state flipped
      }
    }
    return ids;
  }

  function mergeIncomingMessages(incoming) {
    raw.messages = mergeMessages(raw.messages, incoming, messageBufferLimit);
    for (const m of raw.messages) if (m.rxTime && m.rxTime > lastRxTime) lastRxTime = m.rxTime;
  }

  // Recompute all derived state from `raw`, push it to subscribers, then emit the diff
  // (added/changed node ids + new message ids + their senders) on the change channel so the
  // UI can flash. The first populate emits no diff — the kiosk must not flash the whole map
  // on load (D28).
  function recompute() {
    const now = nowSec(clock);
    const prevNodes = state.nodes;
    const prevMsgIds = new Set();
    for (const m of state.messages) if (m.id != null) prevMsgIds.add(m.id);
    const wasPopulated = populated;

    const { nodes, onlineCount } = computePresence(raw.nodes, raw.messages, now);
    set({
      status: "live",
      nodes,
      messages: raw.messages,
      telemetry: raw.telemetry,
      instances: raw.instances,
      counters: computeCounters({
        nodes,
        messages: raw.messages,
        telemetry: raw.telemetry,
        onlineCount,
        nowSec: now,
      }),
      fleet: computeFleetBreakdown(nodes),
      channels: computeChannels(raw.messages),
      lastUpdated: now,
      lastError: null,
    });
    populated = true;
    if (!wasPopulated) return; // never flash the initial load (D28)

    const nodeIds = diffNodes(prevNodes, nodes);
    const newMsgs = [];
    for (const m of raw.messages) if (m.id != null && !prevMsgIds.has(m.id)) newMsgs.push(m);
    if (nodeIds.length === 0 && newMsgs.length === 0) return;
    const senderIds = [];
    for (const m of newMsgs) {
      const sid = m.fromId ?? m.nodeId;
      if (sid != null) senderIds.push(sid);
    }
    emitChange({ nodeIds, messageIds: newMsgs.map((m) => m.id), senderIds });
  }

  async function refresh() {
    const now = nowSec(clock);
    try {
      const priv = state.config && state.config.privateMode;
      const since = lastRxTime || (now - DAY_SEC);
      const [rawNodes, rawMsgs, rawTele, rawInst] = await Promise.all([
        apiClient.nodes(),
        priv ? Promise.resolve([]) : apiClient.messages({ since }),
        apiClient.telemetry(),
        apiClient.instances(),
      ]);
      raw.nodes = (rawNodes || []).map(normalizeNode);
      mergeIncomingMessages((rawMsgs || []).map(normalizeMessage));
      raw.telemetry = (rawTele || []).map(normalizeTelemetry);
      raw.instances = (rawInst || []).map(normalizeInstance);
      recompute();
    } catch (err) {
      set({ status: "degraded", lastError: String((err && err.message) || err) });
    }
  }

  // Refetch only the collections an /api/events change names (D25). `positions` is a node
  // move (positions live on the node object), so it maps to a nodes refetch; an unknown or
  // garbled collection ("*") triggers a full reconcile via refresh(). Messages are skipped
  // under private_mode so the feature never reintroduces /api/messages traffic (AC-12).
  async function applyChange(collections = []) {
    const want = new Set();
    for (const c of collections) {
      if (c === "*") return refresh();
      want.add(c === "positions" ? "nodes" : c);
    }
    const priv = state.config && state.config.privateMode;
    const jobs = [];
    if (want.has("nodes")) {
      jobs.push(
        apiClient.nodes().then((r) => {
          raw.nodes = (r || []).map(normalizeNode);
        }),
      );
    }
    if (want.has("messages") && !priv) {
      const since = lastRxTime || (nowSec(clock) - DAY_SEC);
      jobs.push(
        apiClient.messages({ since }).then((r) => {
          mergeIncomingMessages((r || []).map(normalizeMessage));
        }),
      );
    }
    if (want.has("telemetry")) {
      jobs.push(
        apiClient.telemetry().then((r) => {
          raw.telemetry = (r || []).map(normalizeTelemetry);
        }),
      );
    }
    if (want.has("instances")) {
      jobs.push(
        apiClient.instances().then((r) => {
          raw.instances = (r || []).map(normalizeInstance);
        }),
      );
    }
    if (jobs.length === 0) return; // nothing to do (e.g. messages-only under private_mode)
    try {
      await Promise.all(jobs);
      recompute();
    } catch (err) {
      set({ status: "degraded", lastError: String((err && err.message) || err) });
    }
  }

  return { subscribe, subscribeChanges, getState: () => state, loadConfig, refresh, applyChange };
}
