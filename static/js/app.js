// app.js — meshcom entry. Wires the live store into the CRT shell: top-bar chrome
// + ticker (B2) and the Leaflet map (B3). Rail/feed/roster follow in B4–B6. SPEC.md §7.
import { readBrowserConfig } from "./config.js";
import { createApiClient } from "./api.js";
import { createStore } from "./store.js";
import { createPollingTransport } from "./transport.js";
import { mount } from "./ui/dom.js";
import { createTopbar } from "./ui/topbar.js";
import { createTicker } from "./ui/ticker.js";
import { createMap } from "./ui/map.js";
import { createFeed } from "./ui/feed.js";
import { createRail } from "./ui/rail.js";
import { createRoster } from "./ui/roster.js";
import { fmtAgo, fmtClock } from "./format.js";

function boot() {
  const cfg = readBrowserConfig(globalThis);
  const store = createStore({ apiClient: createApiClient({ apiBase: cfg.apiBase }) });

  const topbar = createTopbar();
  const ticker = createTicker();
  const feed = createFeed();
  let mapApi = null;
  const active = { meshtastic: true, meshcore: true, reticulum: true };
  const rail = createRail({
    onToggleProtocol: (k) => {
      active[k] = !active[k];
      if (mapApi) mapApi.setActiveProtocols(active);
      rail.setActive(active);
      feed.setActive(active);
      roster.setActive(active);
    },
  });
  const roster = createRoster({ onFocus: (n) => mapApi && mapApi.focus(n) });
  mount(document.getElementById("topbar"), topbar.el);
  mount(document.getElementById("ticker"), ticker.el);
  mount(document.getElementById("feed"), feed.el);
  mount(document.getElementById("rail"), rail.el);
  mount(document.getElementById("roster"), roster.el);

  store.subscribe((state) => {
    topbar.update(state);
    ticker.update(state);
    feed.update(state, active);
    rail.update(state, active);
    roster.update(state, active);
    if (mapApi) mapApi.setNodes(state.nodes);
    document.body.dataset.status = state.status;
    if (state.config) document.body.dataset.configSource = state.config.source || "";
  });

  const tick = () => {
    topbar.setClock(fmtClock(new Date()));
    feed.tickAges();
    const s = store.getState();
    topbar.setStale(
      s.status === "degraded" && s.lastUpdated
        ? `STALE ${fmtAgo(Math.floor(Date.now() / 1000) - s.lastUpdated)}`
        : "",
    );
  };
  tick();
  globalThis.setInterval(tick, 1000);

  (async () => {
    let config = null;
    try {
      config = await store.loadConfig();
    } catch {
      // /version + fallback both failed — run with defaults; transport keeps retrying
    }

    try {
      mapApi = await createMap(document.getElementById("map"), {
        tileUrl: cfg.tileUrl,
        tileSubdomains: cfg.tileSubdomains,
        tileAttribution: cfg.tileAttribution,
        tileMaxZoom: cfg.tileMaxZoom,
        mapCenter: config ? config.mapCenter : null,
        maxDistanceKm: config ? config.maxDistanceKm : null,
      });
      mapApi.setNodes(store.getState().nodes);
      mapApi.setActiveProtocols(active);
    } catch {
      // Leaflet unavailable — the rest of the dashboard still runs
    }

    const intervalSec = (config && config.refreshIntervalSec) || 60;
    const transport = createPollingTransport({ intervalSec, tick: () => store.refresh() });
    transport.start();
    globalThis.__MESHCOM__ = { store, transport, map: mapApi, config: cfg };
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
