# meshcom — ACCEPTANCE CRITERIA

> Phase 1 deliverable (kickoff). These are the **precise, testable** criteria a great result must
> meet. Written to be judged **standalone**: a reviewer with zero context from the build session
> should be able to evaluate the repo against this file alone. Decisions referenced as **Dn** live
> in [`SPEC.md`](./SPEC.md) §D.

## Context for the reviewer (what you're judging)

**meshcom** is a live, **client-side** dashboard that renders the claude.ai/design *"Command Center"*
(a CRT/phosphor terminal mesh dashboard — see `Command Center.dc.html` + `screenshots/cc.png` in the
design project) using **real data** from a **potato-mesh** instance. It is an **ambient mission-control
big-screen** for a LoRa mesh community/camp: who's online, live message traffic, growth, federation reach.
It is a sister to `github.com/l5yth/dweb-mesh` (Zola, vanilla JS, CRT theme, Apache-2.0, bundled assets).

Data comes from the potato-mesh HTTP API (default `https://dweb.potatomesh.net`, CORS `*`). Relevant
GET endpoints: `/version`, `/api/nodes`, `/api/messages`, `/api/telemetry`, `/api/instances`
(see `SPEC.md` §5–§6 for exact field shapes). There is **no backend** of our own.

**Legend:** `[auto]` = verifiable by a script/test in the repo · `[obs]` = observable in a running
browser (DevTools/network/visual) · `[code]` = verifiable by reading the source.

A criterion **passes** only if it is fully met. Partial = fail (note it).

---

## A. Repository & conventions

- **AC-1** `[auto]` A `LICENSE` file exists and is **Apache-2.0**. *(D6)*
- **AC-2** `[auto]` `README.md` exists and states: what meshcom is, how to set the API base URL, how to
  build, and how to deploy. A newcomer can run it from the README alone.
- **AC-3** `[auto]` The repo is a **Zola** project: `config.toml` present and `zola build` exits 0,
  producing `public/`. *(D3, D18)*
- **AC-4** `[code]` No frontend framework (no React/Vue/Svelte/Preact in deps or source); UI is
  **vanilla JS ES modules**. The mockup's React/`DCLogic` rendering has been ported to direct DOM. *(D3)*
- **AC-5** `[code]` Repo layout mirrors the dweb-mesh sibling (e.g. `content/ templates/ static/{css,js,fonts,vendor} scripts/`).

## B. Build, deploy & offline discipline

- **AC-6** `[auto]` An offline-discipline check (e.g. `scripts/check-offline.sh`, modeled on dweb-mesh)
  passes: the built `public/` references **no external origins except** (a) the configured API base URL
  and (b) the configured map-tile URL. No `fonts.googleapis.com`, `unpkg.com`, analytics, or other CDNs. *(D5, D17)*
- **AC-7** `[auto]` **Leaflet is vendored locally** (served from `static/vendor`, not a CDN). *(D4, D5)*
- **AC-8** `[auto]` Fonts (Press Start 2P, Departure Mono / mono fallback) are **bundled locally** and
  load from `static/fonts`. *(D5)*
- **AC-9** `[obs]` The built site is fully static — it runs from any static host / `file:`-style serve with
  no server-side code of ours. *(D2)*

## C. Configuration & self-config

- **AC-10** `[auto/code]` API base URL resolves in order **`?api=<url>` → build/Zola config → default
  `https://dweb.potatomesh.net`**. Unit-tested. *(D7)*
- **AC-11** `[obs]` On load, `GET /version` is fetched and applied: instance **`site_name`** appears as the
  header brand; the map centers on **`map_center`**; **`refresh_interval_seconds`** sets the poll cadence;
  **`max_distance_km`** informs map bounds/zoom. *(D8)*
- **AC-12** `[obs]` When `/version` reports **`private_mode: true`**, the live feed is hidden/disabled and
  no `/api/messages` requests are made. *(D8, D12)*

## D. Data layer & transforms (correctness core)

- **AC-13** `[obs]` Polling runs at the server-advised cadence (default 60s); the **feed fetches
  incrementally** via `since=<last rx_time>` rather than refetching all. *(D9)*
- **AC-14** `[auto]` **Online presence is computed correctly:** a node counts as online iff its activity —
  the **latest of `last_heard` or its most-recent message `rx_time`** — is within **4h**. A dedicated unit
  test proves a node with a *stale `last_heard` but a recent message* is online (the MeshCore case). *(D15)*
- **AC-15** `[auto]` Counters are computed from real endpoints and unit-tested: **NODES** = node count,
  **ONLINE** = AC-14 count, **MSGS 24H** = messages with `rx_time ≥ now−24h`, **TELEMETRY** = telemetry
  count, **PKT/MIN** = rolling arrival rate. *(D8, §6)*
- **AC-16** `[auto]` **Three-protocol model** (Meshtastic/MeshCore/Reticulum) renders with **data-driven
  counts**; with the live data Reticulum is **0** and the UI shows it without error. *(D10)*
- **AC-17** `[code/auto]` Field mapping matches `SPEC.md` §6: node popups, feed items, and roster columns
  read the correct API fields; **HOPS column is absent**; **MESH HEALTH is replaced by "% nodes online."** *(D16, §6)*
- **AC-18** `[auto]` Deterministic **fixtures/replay** exist; the UI runs and tests pass **without a live
  instance**. *(D13)*

## E. UI fidelity to the design

- **AC-19** `[obs]` All seven regions are present and laid out per the design: **top bar** (brand · counters ·
  UTC clock · LIVE), **left rail**, **center map**, **right live feed**, **node roster**, **status ticker**,
  plus **CRT overlays** (scanlines + vignette) and the map **radar sweep + scan line**. *(D12, §7)*
- **AC-20** `[obs]` Visual language matches the mockup: phosphor palette (green `#41ff8a`, amber `#ffb24a`,
  cyan `#6fe6ff` on near-black), Press Start 2P headings + monospace body, glow/text-shadow treatment.
  Compare against `screenshots/cc.png`.
- **AC-21** `[obs]` LIVE indicator blinks; UTC clock ticks every second; counters animate on update.

## F. Behavior & interactivity

- **AC-22** `[obs]` **Map:** real nodes plot at correct lat/lon, colored by protocol, with online vs offline
  styling; clicking a marker opens a popup of real node fields (id, names, hw, role, snr, batt, seen). *(§6)*
- **AC-23** `[obs]` **Roster→map link:** clicking a roster row flies the map to that node and opens its popup. *(§7)*
- **AC-24** `[obs]` **Feed:** newest-first; new messages appear on poll; **pause/resume** works (freezes the
  stream); each item shows channel · from · text · SNR · RSSI · age. *(§7)*
- **AC-25** `[obs]` **Rail:** protocol filter toggles both map markers and roster; fleet-breakdown bars,
  packets/min sparkline, channel list with counts, and the % online figure all reflect live data. *(§7)*
- **AC-26** `[obs]` **Roster:** search filters by id/name/hw/role; column headers sort; the list **virtual-scrolls**
  smoothly across the full node set (~480+); a "shown / total" count is displayed. *(§7)*
- **AC-27** `[obs]` **Ticker:** shows **FEDERATION SYNC N INSTANCES** where N = `/api/instances` length, plus
  live metrics. *(D11, §10)*

## G. Ambient / kiosk qualities

- **AC-28** `[obs]` Legible and correctly laid out at large display resolutions (≥1080p, ideally 4K) and
  still usable on a laptop; no horizontal scroll, no clipped panels. *(D1)*
- **AC-29** `[obs/code]` Designed for unattended long-running display: timers are cleared on teardown, the
  feed buffer is capped, and there is **no unbounded memory growth** over an extended run. *(D1)*
- **AC-30** `[obs]` Poll updates do not cause layout jump/flicker or scroll-position loss.

## H. Resilience & degraded state

- **AC-31** `[obs]` If the API is unreachable or errors, the UI shows an **OFFLINE/degraded indicator** and
  **retains last-known data**; it recovers automatically when the API returns. (Verify by pointing `?api=`
  at a bad URL, then back.) *(D9, §9)*
- **AC-32** `[obs]` If map tiles fail to load, node markers still render (map degrades gracefully). *(§9)*
- **AC-33** `[auto]` Empty/partial data (no nodes, no messages, missing optional fields like
  `battery_level`) renders without runtime errors. *(§6)*

## I. Tests, CI & quality bar

- **AC-34** `[auto]` Unit tests cover all data transforms (presence, counters, rate, field mapping,
  config resolution) and **pass**. *(D13)*
- **AC-35** `[auto]` Lint/format is clean (a documented `lint`/`format` command exits 0). *(D13)*
- **AC-36** `[auto]` **GitHub Actions CI** exists and runs build + tests + offline-check on push/PR. *(D13)*

## J. Future-proofing

- **AC-37** `[code]` The data **transport is abstracted** behind a single interface so polling can be
  swapped for SSE/WebSocket pubsub **without changing UI components**. *(D9, D11, §11)*

---

## Definition of Done

meshcom is **done** when: every AC above passes (auto checks green, observable checks demonstrated,
code checks reviewed); `SPEC.md` decisions D1–D18 are still honored (no drift); and the independent
Phase 4 review (a fresh reviewer judging strictly against this file) reports **zero failures**.
