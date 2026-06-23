# meshcom — SPEC

> Status: **DRAFT — awaiting your explicit confirmation of each numbered decision (§D).**
> Until every item in §D is confirmed, no build work starts (kickoff Phase 0).
> Re-verified at every later checkpoint so we don't drift from intent.

---

## §0 Source artifacts (ground truth)

- **Design:** claude.ai/design project *"Federated node command center"* — file `Command Center.dc.html`
  (CRT/phosphor terminal dashboard; React-via-`DCLogic` + Leaflet; **synthetic** seeded-RNG data).
  Alt file `Layout Directions.dc.html` (layout variants) to consult during build.
- **Design sibling:** `github.com/l5yth/dweb-mesh` — Zola static site, vanilla JS + CRT CSS,
  Apache-2.0, fonts bundled, offline-first ("no CDN/webfonts/external JS/remote anything").
- **Data source:** `github.com/l5yth/potato-mesh` (Ruby/Sinatra+Leaflet+SQLite, Apache-2.0).
  Live dev/test instance `https://dweb.potatomesh.net`. **CORS `*` verified.**
  `/version` self-describes: `site_name, channel, frequency, map_center, max_distance_km,
  refresh_interval_seconds, private_mode`.

---

## §1 Purpose & core decision (CONFIRMED in interview)

meshcom is a **real, live, client-side** rendering of the Command Center design, fed by a
potato-mesh instance, built as an **ambient mission-control** for a mesh community/camp —
an **always-on big-screen / kiosk** showing, at a glance: who's online, live message traffic
by channel, network growth, and federation reach. It is *celebratory situational awareness*,
not per-node operator alerting (secondary) nor a node-directory explorer (secondary).

## §2 Non-goals (v1)

- No backend / no server of our own. No data ingestion (potato-mesh does that).
- No authentication, no POST/write to the API, no admin controls.
- No per-node alerting/paging, no historical analytics warehouse.
- No multi-instance client-side aggregation (federation is surfaced, not merged) — see §10.
- Not fully offline (needs network for API + tiles) — unlike dweb-mesh. See §9.

---

## §3 Architecture

Pure **client-side static app**. Browser polls the potato-mesh HTTP API directly
(CORS `*`). Output = static files deployable on **any static host** (GitHub Pages, a
Freifunk box, S3, *or dropped into a Zola site*), matching "deployable anywhere (e.g. zola)".

## §4 Stack & conventions (match the sibling)

- **Zola** project + **vanilla JS (ES modules), no framework** + hand-written CSS.
  → Port the mockup off React/`DCLogic` to direct DOM rendering.
- **Leaflet** for the map, **vendored locally** (no unpkg CDN).
- **Fonts bundled locally** (Press Start 2P, Departure Mono / JetBrains-Mono fallback) — no Google Fonts.
- **Apache-2.0** license; README; repo layout mirroring dweb-mesh (`content/ templates/
  static/{css,js,fonts,vendor} scripts/`).
- Quality bar mirrors potato-mesh: unit tests for data transforms, lint/format, GitHub Actions CI,
  and an adapted `check-offline`-style guard (asserts no remote deps **except** the API + tiles).

---

## §5 Data layer

- **Configurable API base URL.** Resolution: `?api=<url>` query param → Zola/build config
  (`config.toml [extra]` compiled into a `config.js`) → default `https://dweb.potatomesh.net`.
- **Self-config from `/version` on load** (and periodic re-fetch): brand/site name → header;
  `map_center` + `max_distance_km` → map center/bounds; `refresh_interval_seconds` → poll
  cadence (default 60s); `private_mode` → hide feed if true.
- **Polling model (v1).** Per-endpoint pollers on the server-advised cadence; feed fetched
  **incrementally** via `since=<last rx_time>`. Pause control retained (freezes feed).
- **Endpoints consumed:** `/version`, `/api/nodes`, `/api/messages`, `/api/telemetry`,
  `/api/instances` (federation). Secondary/optional: `/api/neighbors`, `/api/traces`,
  `/api/positions`. (`/metrics`, `/api/ingestors` not used in v1.)
- **Transport is swappable** so future pubsub (SSE/WebSocket) replaces polling without UI churn.
- **Dev/test fixtures:** captured JSON snapshots + a tiny replay mode, so the UI runs without
  a live instance and tests are deterministic.

## §6 Field mapping & discrepancy resolutions (design → real API)

| Design element | Real source | Resolution |
|---|---|---|
| Counter NODES | `/api/nodes` length (or instance `nodes_count`) | dynamic, not 3,000 |
| Counter ONLINE (+ map/roster online dot) | node "active" within **4h**, where activity = latest of node `last_heard` **OR** that node's most-recent message `rx_time` | chat counts as presence (MeshCore sends few adverts/telemetry) — OPEN-1 resolved |
| Counter MSGS 24H | `/api/messages` since `now-24h` | `since` param |
| Counter TELEMETRY | `/api/telemetry` count | dynamic |
| Counter PKT/MIN | rolling msg(+telemetry) arrival rate | computed client-side |
| Map (3,000 Seattle nodes) | `/api/nodes` lat/lon; center/bounds from `/version` | **Berlin/~480, data-driven** |
| Node popup fields | node object (id, names, hw, role, snr, rssi via telemetry, batt, seen) | direct |
| Feed item | message object (`channel_name, from_id→short_name, text, snr, rssi, rx_time`) | direct |
| Rail: protocol filter/breakdown | per-`protocol` counts | 3 protocols, data-driven (§8) |
| Rail: packets/min sparkline | rolling rate history | computed |
| Rail: channels | distinct `channel_name` w/ message counts | direct |
| Rail: MESH HEALTH 98.x% | *no API field* | **replaced with % nodes online** (OPEN-2 resolved) |
| Roster col HOPS | *not on node object* | **dropped** (OPEN-2 resolved) |
| Ticker: FEDERATION SYNC N | `/api/instances` length | direct |
| Ticker: other lines | derive from real metrics where possible; keep rest as flavor | — |

## §7 UI compartments (priority tuned for ambient mission-control)

1. **Top bar** — brand (from `/version`), counters, UTC clock, LIVE pulse. *(high)*
2. **Map** — real nodes, protocol-colored, center/bounds from `/version`, popups, sweep/scan FX. *(high)*
3. **Live feed** — newest-first messages, channel/from/snr/rssi, pause, `private_mode` aware. *(high)*
4. **Left rail** — protocol filter, fleet breakdown, packets/min sparkline, channels, federation/health. *(high)*
5. **Node roster** — search, sortable, virtual-scroll, click→locate on map. *(medium)*
6. **Status ticker** — federation + live metrics. *(medium)*
7. **CRT/kiosk polish** — scanlines/vignette, responsive to display sizes, degraded/offline state. *(high for big-screen)*

## §8 Protocols

Keep the **three-protocol** model (Meshtastic green, MeshCore cyan, Reticulum amber) because
the federation schema counts all three; chip counts/filters are **data-driven** (Reticulum = 0 today).

## §9 Asset / offline policy

Honor dweb-mesh's "bundle everything" ethos as far as feasible: vendor Leaflet + fonts, **no CDNs**.
The only unavoidable remote deps: **(a) the potato-mesh API**, **(b) map tiles** (both configurable).
Provide a graceful **degraded state** (last-known data + OFFLINE indicator) when either is unreachable.
Map tiles: default CARTO dark (matches the look), tile URL configurable for self-hosted/Freifunk — OPEN-3.

## §10 Federation (v1)

Point at **one** configurable instance (which itself federates server-side). Surface
`/api/instances` as a federation indicator/panel (count, names, per-protocol reach).
Client-side multi-instance aggregation = future, alongside pubsub.

## §11 Future (out of scope, designed-for)

Pubsub push (SSE/WebSocket) via the swappable transport; possible multi-instance aggregation.

## §12 Build buckets (one at a time; plan → build → checkpoint → sign-off)

- **B0 Scaffold** — Zola project, Apache-2.0, README, vendored Leaflet + fonts, config plumbing,
  CI + offline-check, `git init`.
- **B1 Data layer** — API client, `/version` self-config, pollers, models, fixtures/replay, transforms + unit tests.
- **B2 Shell** — layout grid, top-bar counters, clock/LIVE, status ticker.
- **B3 Map** — Leaflet, real nodes, center/bounds, protocol layers, popups, FX.
- **B4 Feed** — messages, channels, pause, incremental `since`, `private_mode`.
- **B5 Rail** — protocol filter, fleet breakdown, sparkline, channels, federation/health.
- **B6 Roster** — search, sort, virtual scroll, click→locate.
- **B7 Polish** — CRT FX, kiosk responsiveness, degraded/offline, big-screen perf (~480+ nodes).

---

## §D Numbered decisions — **confirm each explicitly**

1. **Intent:** live, client-side, **ambient mission-control** big-screen dashboard of the Command Center design, fed by potato-mesh. *(confirmed in interview)*
2. **Architecture:** pure static client app, no backend; calls the API directly (CORS `*`); deployable on any static host incl. a Zola site.
3. **Stack:** Zola + **vanilla JS (no framework)** + hand-written CSS; port the mockup off React/`DCLogic`.
4. **Map lib:** Leaflet, **vendored locally**.
5. **Assets:** fonts + Leaflet **bundled**, **no CDNs**; only remote deps = API + tiles.
6. **License:** **Apache-2.0** (match siblings).
7. **Data source:** configurable base URL, default `https://dweb.potatomesh.net`; resolve `?api=` → config → default.
8. **Self-config:** read `/version` for brand, `map_center`, `max_distance_km`, `refresh_interval_seconds`, `private_mode`.
9. **Transport (v1):** **polling** on the server-advised cadence; feed incremental via `since`; transport swappable for future pubsub.
10. **Protocols:** keep **3-protocol** model (MT/MC/RNS), counts data-driven, Reticulum shows 0 today.
11. **Federation (v1):** single configurable instance; surface `/api/instances` as an indicator; no client-side multi-instance merge.
12. **Scope:** all 7 UI compartments (§7) ship, ambient-priority ordered; non-goals per §2.
13. **Quality bar:** unit-tested transforms, lint/format, GitHub Actions CI, adapted offline-check, README; deterministic fixtures/replay.
14. **Build order:** buckets B0–B7 (§12), one at a time with checkpoints.

### Resolved picks (confirmed 2026-06-23)

15. **Online window:** a node is "online" if it has **activity within 4h**, where activity =
    the latest of its node `last_heard` **or** its most-recent message `rx_time`. Chat traffic
    counts as presence — MeshCore sends few adverts/telemetry, so `last_heard` alone understates it.
    (Implication: the data layer must join recent messages back to nodes to compute presence.)
16. **Unmapped mockup bits:** MESH HEALTH → **% of nodes online**; roster **HOPS column dropped**.
17. **Map tiles:** default **CARTO dark**, **tile URL configurable** (self-hosted/Freifunk override).
18. **Project shape:** meshcom is **its own Zola repo** (sibling to dweb-mesh).
