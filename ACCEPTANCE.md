# meshint — ACCEPTANCE CRITERIA

> Phase 1 deliverable (kickoff). These are the **precise, testable** criteria a great result must
> meet. Written to be judged **standalone**: a reviewer with zero context from the build session
> should be able to evaluate the repo against this file alone. Decisions referenced as **Dn** live
> in [`SPEC.md`](./SPEC.md) §D.

## Context for the reviewer (what you're judging)

**meshint** is a live, **client-side** dashboard that renders the claude.ai/design *"Command Center"*
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
- **AC-2** `[auto]` `README.md` exists and states: what meshint is, how to set the API base URL, how to
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
  the **latest of `last_heard` or its most-recent message `rx_time`** — is within **48h** (>24h). A dedicated unit
  test proves a node with a *stale `last_heard` but a recent message* is online (the MeshCore case). *(D15)*
- **AC-15** `[auto]` Counters are computed from real endpoints and unit-tested: **NODES** = node count,
  **ONLINE** = AC-14 count, **MSGS 24H** = messages with `rx_time ≥ now−24h`, **TELEMETRY** = telemetry
  count, **PKT/HR** = packets (msgs+telemetry) per hour, 24h-averaged. *(D8, §6)*
- **AC-16** `[auto]` **Three-protocol model** (Meshtastic/MeshCore/Reticulum) renders with **data-driven
  counts**; with the live data Reticulum is **0** and the UI shows it without error. *(D10)*
- **AC-17** `[code/auto]` Field mapping matches `SPEC.md` §6: node popups, feed items, and roster columns
  read the correct API fields; **HOPS column is absent**; **MESH HEALTH is replaced by "% nodes online."** *(D16, §6)*
- **AC-18** `[auto]` Deterministic **fixtures/replay** exist; the UI runs and tests pass **without a live
  instance**. *(D13)*

## E. UI fidelity to the design

- **AC-19** `[obs]` All seven regions are present and laid out per the design: **top bar** (brand · counters ·
  UTC clock · LIVE), **left rail**, **center map**, **right live feed**, **node roster**, **status ticker**,
  plus **CRT overlays** (scanlines + vignette). *(D12, §7; the map's looping radar-sweep + scan-line FX
  were intentionally removed 2026-06-24 for ambient comfort — the map shows **no looping motion**.)*
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
  packets/hr sparkline (24×1h bars), channel list with counts, and the % online figure all reflect live data. *(§7)*
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
- **AC-38** `[auto/code]` Endpoints capped at 1000 upstream are fetched via the **`before` backward
  cursor** until exhausted (deduping the inclusive boundary), so the dashboard isn't limited to 1000
  rows. Messages page today (a unit test pages a fake feed **past 1000**); nodes/telemetry use the
  same `pageAll` helper (cursor = the endpoint's `ORDER BY` field) and paginate automatically once
  the upstream cursor exists — until then they self-terminate to a single page. *(SPEC.md §5)*

---

## Feature: CI deploy (GitHub Pages)

> Continuous deployment of the built `public/` to **`https://meshint.potatomesh.net`** via GitHub
> Actions + GitHub Pages. New decisions **D19–D22** in `SPEC.md`. Judge these standalone, then verify
> the regression line below. *(Repo: `git@github.com:l5yth/meshint.git`.)*

### K. Continuous deployment

- **AC-39** `[auto]` A GitHub Actions workflow publishes the built `public/` to **GitHub Pages**. The
  deploy step is **gated**: it runs **only on `push` to `main`** (plus manual `workflow_dispatch`) and
  **`needs` the build/test/offline-check gate**; it does **not** run on `pull_request` or for forks. A
  reviewer can confirm the trigger conditions and job dependency by reading `.github/workflows/`. *(D19, D20)*
- **AC-40** `[code]` The deploy authenticates with the built-in **`GITHUB_TOKEN` via OIDC** under
  **least-privilege** `permissions:` (`pages: write`, `id-token: write`). **No repo secret** (`secrets.*`,
  deploy keys, PATs) and **no third-party deploy action** are used. *(D19)*
- **AC-41** `[auto]` A **`static/CNAME`** file contains exactly `meshint.potatomesh.net`; `zola build`
  emits `public/CNAME`. The offline check (**AC-6**) still passes with the file present, and `base_url`
  remains `/` so the same artifact still runs from any static host (**AC-9**). *(D21, D18)*
- **AC-42** `[auto/code]` The **shipped** default API base is the public mesh:
  `config.toml [extra].api_base == "https://potatomesh.net"`, so a no-query-param load targets it. The
  **code-level `DEFAULT_API_BASE` stays `https://dweb.potatomesh.net`** as the documented last-resort
  fallback, and the `?api=` / `?d=` override chain still resolves per D7. The config unit tests pass. *(D22, D7)*
- **AC-43** `[auto]` **Publishing is gated on offline-clean output:** the deploy job runs
  `scripts/check-offline.sh` (or equivalent) against the built site **before** the Pages deploy, so a build
  that fails the offline check **cannot** be published. *(D20)*
- **AC-44** `[obs]` After a push to `main` (and the one-time repo setting **Pages → Source = "GitHub
  Actions"**), **`https://meshint.potatomesh.net`** serves the dashboard over **HTTPS** with a valid
  auto-provisioned certificate, defaulting (no query param) to the `potatomesh.net` instance. *(D19, D21, D22)*

### Regression (must still pass after this feature lands)

- **All prior criteria AC-1…AC-38 must still pass.** Specifically at risk, and how each is protected:
  - **AC-36** (CI runs build+tests+offline-check on push/PR) — the existing `build` job is left
    **unchanged**; deploy is an *added* job, so the gate still runs on every push and PR.
  - **AC-6** (offline check) — the `CNAME` file is a bare hostname with no scanned extension, and
    `api_base` lives in an inline `<script>` body (not a `src`/`href`/`@import`/`url()`), so neither is an
    asset origin; the check stays green.
  - **AC-9** (runs from any static host) — `base_url` stays `/`; no host-coupling introduced.
  - **AC-10 / AC-34** (config resolution + transform unit tests) — tests assert against the *imported*
    `DEFAULT_API_BASE` constant and explicit `buildConfig`, not the literal host, so changing the shipped
    default does not break them.
  - **AC-2** (README documents build **and deploy**) — README is updated to document the auto-deploy, the
    live URL, and the new shipped default; it must remain runnable-from-the-README.

---

## Feature: Realtime updates via pubsub (SSE) + update flash

> Realtime updates via the upstream **`/api/events`** SSE stream, used as the **primary** live
> source when available (else polling continues unchanged), plus an ambient, **non-looping**
> **update flash** on changed nodes/messages. New decisions **D23–D28** in `SPEC.md`. Judge
> these standalone, then verify the regression line below. Live on `dweb.potatomesh.net` today;
> the shipped `potatomesh.net` default has **no** events yet and must keep working via polling.

### L. Realtime updates (pubsub) + update flash

- **AC-45** `[code/auto]` An **events/SSE transport** exists alongside the polling transport and
  conforms to the **same `{ start, stop, running }` contract** (AC-37). It consumes `/api/events`
  via the browser-native **`EventSource`** — **no WebSocket, no vendored/CDN dependency, no new
  asset origin**. It is **unit-tested** with an injected `EventSource` fake (connect, message,
  fatal error, teardown). *(D23, D24)*
- **AC-46** `[obs/code]` On load, state is populated from the **REST API first** (initial
  snapshot); then, when `/api/events` is reachable, the SSE stream becomes the **primary** live
  source and the **fast per-cadence poll is stopped**, leaving only a **~5-minute reconcile**
  full refresh as a backstop. *(D23)*
- **AC-47** `[auto/code]` Each `event: change` carrying `data:{"collection":"<name>"}` triggers a
  **refetch of just that collection** (messages **incrementally via `since`**; `positions`
  handled as a `nodes` change), recomputes presence/counters via the **existing transforms**, and
  **diffs** against current state. Rapid events are **coalesced (~300 ms)** into a single batched
  refetch. A unit test proves a `change:nodes` event causes **one** nodes refetch and surfaces the
  **changed node ids**. *(D25, D27)*
- **AC-48** `[obs/code]` **Capability detection is runtime, not config:** a successful
  `EventSource` connection enables pubsub; a **fatal** connection error (e.g. 404/CORS,
  `readyState === CLOSED`) makes the app **fall back to normal polling** at the `/version` cadence
  with no user-visible breakage. Verifiable by pointing `?api=` at an instance **without**
  `/api/events` (e.g. the shipped `potatomesh.net` default) → the dashboard still updates via
  polling. *(D26)*
- **AC-49** `[obs]` **Streaming resilience:** a **transient** SSE drop after a good connect shows
  the existing **OFFLINE/degraded** indicator, **retains last-known data**, and **auto-recovers**
  (reconnects / resumes live updates) when the stream returns — matching AC-31 for the streaming
  path. *(D26)*
- **AC-50** `[obs/code]` **Update flash:** when a diff arrives — and **never on the initial
  load** — changed/new **node markers** flash a **one-shot** ring that **flashes white and fades to
  the node's protocol color**, **decaying in ≈1.2 s**; a **new message** flashes its **sender's
  node marker** while the feed row keeps its existing entry animation. The flash **does not loop**,
  is **coalesced/rate-capped** so a busy mesh **cannot strobe**, and animates
  **transform/opacity/color on a separate overlay layer** — **no layout reflow, no scroll jump**.
  *(D28)*
- **AC-51** `[obs/code]` **Unattended safety:** the `EventSource` and all flash timers are
  **closed/cleared on teardown** (`transport.stop()` closes the stream); over a long run there is
  **no unbounded growth** of listeners, DOM flash nodes, or timers. *(D28)*
- **AC-52** `[auto]` **Offline discipline holds:** with the events transport present,
  `scripts/check-offline.sh` against the built `public/` still **passes** — `/api/events` is the
  same configured API origin and `EventSource` is JS-driven, so **no new external asset origin**
  is introduced. *(D24)*

### Regression (must still pass after this feature lands)

- **All prior criteria AC-1…AC-44 must still pass.** Specifically at risk, and how each is
  protected:
  - **AC-13** (polling at the server-advised cadence; incremental `since`) — **scope-amended, not
    broken:** the cadence clause now governs the **fallback/polling** path; under pubsub the fast
    poll is *intentionally* replaced by event-driven refetch + the 5-min reconcile (D23), while
    the **incremental-`since`** behavior is preserved (the `messages` collection still refetches
    via `since`). On any instance **without** `/api/events` (including the shipped
    `potatomesh.net` default), AC-13 holds **verbatim**.
  - **AC-12** (private_mode hides feed; no `/api/messages`) — preserved: a `change:messages` event
    is **ignored while `private_mode` is true** (no messages refetch), so the feature does not
    reintroduce message traffic in private mode.
  - **AC-19** (map shows **no looping motion**) — the flash is one-shot, decaying, rate-capped,
    and event-driven (D28); it introduces **no looping motion**.
  - **AC-37** (transport abstracted; UI unchanged on swap) — the events transport keeps the
    `{ start, stop, running }` contract and the store's subscriber contract is **unchanged**; the
    diff channel is **additive**.
  - **AC-31** (degraded + auto-recover) — extended to the streaming path by **AC-49**; the polling
    fallback path is unchanged.
  - **AC-29 / AC-30** (bounded long-run; no layout jump) — protected by **AC-51** (teardown/caps)
    and **AC-50** (compositor-only flash).
  - **AC-6** (offline check) — protected by **AC-52** (no new asset origin).

---

## Definition of Done

meshint is **done** when: every AC above passes (auto checks green, observable checks demonstrated,
code checks reviewed); `SPEC.md` decisions D1–D18 are still honored (no drift); and the independent
Phase 4 review (a fresh reviewer judging strictly against this file) reports **zero failures**.
