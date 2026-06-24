// SPDX-License-Identifier: Apache-2.0
// store.js — the meshint state store. SPEC.md §5, D8/D9/D15.
// Single source of truth: fetches via the injected api client, normalizes, computes
// presence + counters, and notifies subscribers. Transport-agnostic — the app
// composes it with a transport (poll now, pubsub later), so the store never knows
// how it is driven (AC-37). On fetch error it degrades but keeps last-known data
// (AC-31).
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

  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
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

      const nodesRaw = (rawNodes || []).map(normalizeNode);
      const incoming = (rawMsgs || []).map(normalizeMessage);
      const telemetry = (rawTele || []).map(normalizeTelemetry);
      const instances = (rawInst || []).map(normalizeInstance);

      const messages = mergeMessages(state.messages, incoming, messageBufferLimit);
      for (const m of messages) if (m.rxTime && m.rxTime > lastRxTime) lastRxTime = m.rxTime;

      const { nodes, onlineCount } = computePresence(nodesRaw, messages, now);

      set({
        status: "live",
        nodes,
        messages,
        telemetry,
        instances,
        counters: computeCounters({ nodes, messages, telemetry, onlineCount, nowSec: now }),
        fleet: computeFleetBreakdown(nodes),
        channels: computeChannels(messages),
        lastUpdated: now,
        lastError: null,
      });
    } catch (err) {
      set({ status: "degraded", lastError: String((err && err.message) || err) });
    }
  }

  return { subscribe, getState: () => state, loadConfig, refresh };
}
