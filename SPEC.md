# meshint — SPEC

> Status: **LOCKED — all 18 decisions (D1–D18) confirmed 2026-06-23.**
> Re-verified at every later checkpoint so we don't drift from intent. Any change requires re-confirmation.

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

meshint is a **real, live, client-side** rendering of the Command Center design, fed by a
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
| Counter ONLINE (+ map/roster online dot) | node "active" within **48h**, where activity = latest of node `last_heard` **OR** that node's most-recent message `rx_time` | chat counts as presence (MeshCore sends few adverts/telemetry) — OPEN-1 resolved |
| Counter MSGS 24H | `/api/messages` since `now-24h` | `since` param |
| Counter TELEMETRY | `/api/telemetry` count | dynamic |
| Counter PKT/HR | msgs+telemetry packets per hour, 24h-averaged | computed client-side |
| Map (3,000 Seattle nodes) | `/api/nodes` lat/lon; center/bounds from `/version` | **Berlin/~480, data-driven** |
| Node popup fields | node object (id, names, hw, role, snr, rssi via telemetry, batt, seen) | direct |
| Feed item | message object (`channel_name, from_id→short_name, text, snr, rssi, rx_time`) | direct |
| Rail: protocol filter/breakdown | per-`protocol` counts | 3 protocols, data-driven (§8) |
| Rail: packets/hr sparkline | 24 hourly bars over the last 24h | computed |
| Rail: channels | distinct `channel_name` w/ message counts | direct |
| Rail: MESH HEALTH 98.x% | *no API field* | **replaced with % nodes online** (OPEN-2 resolved) |
| Roster col HOPS | *not on node object* | **dropped** (OPEN-2 resolved) |
| Ticker: FEDERATION SYNC N | `/api/instances` length | direct |
| Ticker: other lines | derive from real metrics where possible; keep rest as flavor | — |

## §7 UI compartments (priority tuned for ambient mission-control)

1. **Top bar** — brand (from `/version`), counters, UTC clock, LIVE pulse. *(high)*
2. **Map** — real nodes, protocol-colored, center/bounds from `/version`, popups. *(high)*
   *(2026-06-24: the looping radar-sweep + scan-line map FX were removed for ambient/kiosk comfort
   per D1 — too fatiguing to stare at on an always-on display; static CRT scanlines/vignette (§7.7) remain.)*
3. **Live feed** — newest-first messages, channel/from/snr/rssi, pause, `private_mode` aware. *(high)*
4. **Left rail** — protocol filter, fleet breakdown, packets/hr sparkline, channels, federation/health. *(high)*
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

15. **Online window:** a node is "online" if it has **activity within 48h** (>24h), where activity =
    the latest of its node `last_heard` **or** its most-recent message `rx_time`. Chat traffic
    counts as presence — MeshCore sends few adverts/telemetry, so `last_heard` alone understates it.
    (Implication: the data layer must join recent messages back to nodes to compute presence.)
16. **Unmapped mockup bits:** MESH HEALTH → **% of nodes online**; roster **HOPS column dropped**.
17. **Map tiles:** default **CARTO dark**, **tile URL configurable** (self-hosted/Freifunk override).
18. **Project shape:** meshint is **its own Zola repo** (sibling to dweb-mesh).

---

## Feature: CI deploy (GitHub Pages) — confirmed 2026-06-24

> Continuous deployment of the built `public/` to **`https://meshint.potatomesh.net`** via GitHub
> Actions + GitHub Pages. Extends D13 (CI) with a publish stage; amends D7's *shipped* default API
> base. DNS for the custom domain is ready (CNAME/ALIAS → GitHub Pages).

19. **Deploy target:** GitHub Pages via **GitHub Actions** — `actions/upload-pages-artifact` +
    `actions/deploy-pages` authenticating with **OIDC** (`permissions: pages: write, id-token: write`).
    **No third-party action and no repo secret** (the built-in `GITHUB_TOKEN` is sufficient — keeps the
    no-secrets posture; `guard.py` already allowlists `*.potatomesh.net`). *(honors D2, D5)*
20. **Trigger & gating:** deploy runs **only on `push` to `main`** plus manual **`workflow_dispatch`**.
    The deploy job **`needs:` the existing `build` gate** (fmt/lint/test → `zola build` → offline-check)
    and **re-runs `check-offline.sh` before publishing**, so nothing reaches the live site unless CI is
    green and offline-clean. **Pull requests and forks never deploy** (no publish, no token exposure).
    The existing `build` job is left unchanged. *(extends D13; preserves AC-36)*
21. **Custom domain:** served at **`https://meshint.potatomesh.net`** via a committed **`static/CNAME`**
    (Zola copies `static/` → `public/CNAME`). **`base_url` stays `/`** (host-less, portable — the same
    artifact still runs on any static host). The `CNAME` file holds only a bare hostname, so it is not an
    asset origin and is invisible to the offline check. **One-time manual repo setting required:** GitHub
    repo → Settings → Pages → **Source = "GitHub Actions"** (cannot be set from code; the operator must do
    it once). *(honors D18; preserves AC-6, AC-9)*
22. **Production default API base (amends D7):** ship **`config.toml [extra].api_base =
    "https://potatomesh.net"`** so the live kiosk (no query param) shows the **public** mesh. The
    code-level last-resort fallback **`DEFAULT_API_BASE` stays `https://dweb.potatomesh.net`** (the
    CORS-verified dev/test instance per §0, used only when no build config and no query param are present).
    The `?api=` / `?d=` override chain (D7) is unchanged. CLAUDE.md and README prose are updated so the
    shipped default is stated openly — no silent drift. Unit tests are unaffected (they assert against the
    imported constant and explicit `buildConfig`, not the literal host). *(amends D7)*

---

## Feature: Realtime updates via pubsub (SSE) + update flash — confirmed 2026-06-24

> Use the upstream **`/api/events`** Server-Sent-Events stream as the **primary** live source
> when available, replacing fast polling: populate state from the REST API on load, then apply
> pushed changes and **flash** changed nodes/messages on the map (ambient, non-looping).
> Realizes the D9/§5/§11 "swappable transport → future pubsub" path. Live on
> `dweb.potatomesh.net` today; instances without it transparently keep polling.
>
> **Conflict check.** *Extends* D9, §5, §11, and D8 (adds runtime capability detection).
> *Consistent with* D1/§7.2/AC-19 — the flash is event-driven, decaying, coalesced, and
> **non-looping** (ambient-cinematic; D28), so the locked "no looping motion" rule is honored,
> not amended; D2 (read-only — SSE is server→client, refetches are GET); D5/AC-6 (native
> `EventSource` to the same configured origin — no dependency, no new asset origin); D22/§0
> (shipped default unchanged — prod just polls until it ships events); AC-37 (new transport
> keeps the `{start,stop,running}` contract; the store's subscriber contract is unchanged).
> *Amends* **AC-13** (scope only): the server-advised cadence governs the *fallback* path; under
> pubsub the fast poll is replaced by event-driven refetch + a 5-min reconcile (D23), while the
> incremental-`since` clause still holds. **No locked decision is contradicted.**

23. **Transport — pubsub-primary + reconcile backstop.** When `/api/events` is reachable, an SSE
    transport is the **primary** live source. The fast per-cadence poll is replaced by
    (a) **event-driven refetches** (D25) and (b) a **5-minute reconcile** full `refresh()` as a
    backstop against missed/dropped events. With no pubsub, behavior is **unchanged**: polling at
    the `/version` cadence (default 60s). The UI is populated from the REST API on load **first**,
    then kept live by the stream. *(extends D9/§5/§11; amends AC-13 scope)*
24. **SSE via native `EventSource`.** `/api/events` is `text/event-stream`, CORS `*`. Consumed
    with the browser-native **`EventSource`** — no vendored dependency, no WebSocket, and **no new
    asset origin** (the same configured API host), so `check-offline.sh`/AC-6 is unaffected.
    *(honors D5, D2)*
25. **Coarse change signals → refetch-and-diff.** Each `event: change` carries
    `data:{"collection":"<name>"}` (`nodes`, `positions`, `messages`, `telemetry`, `instances`) —
    **not the row**. On a change meshint **refetches that collection** (incrementally where
    supported — messages via `since`), recomputes presence/counters via the existing transforms,
    and **diffs** against current state. `positions` is handled as a `nodes` change (position
    lives on the node object). Bursts are **coalesced** (~300 ms) into one batched refetch; an
    unknown collection triggers a light reconcile. *(honors D2/D8/D15; AC-13/14/15 transforms
    unchanged)*
26. **Runtime capability detection (no config flag).** `/version` advertises no pubsub flag, so
    availability is detected **live**: open the `EventSource`; success (`onopen` / the `: connected`
    comment) → enable pubsub-primary; a **fatal** error (readyState `CLOSED` — 404/CORS/wrong
    content-type) → close it and fall back to polling. A **transient** drop after a good connect
    keeps the existing reconnect + OFFLINE/degraded behavior, then resumes. *(honors §0/D22;
    preserves AC-31)*
27. **Store diff channel (additive).** The store stays the single source of truth and
    transport-agnostic; it gains an **additive** signal reporting *what changed* (added/updated
    node ids, new message ids) so the UI can flash precisely. The full-replace `refresh()` and the
    existing subscriber contract are **unchanged** (back-compat). *(honors AC-37)*
28. **Update flash — ambient-cinematic, non-looping.** On a diff (**never** on initial load),
    changed/new **node markers** flash a one-shot ring that **flashes white and fades to the
    node's protocol color**, **decaying in ~1.2 s**; a **new message** flashes its **sender's node
    marker** (the feed row keeps its existing entry animation). Flashes are **coalesced and
    rate-capped** so a busy mesh cannot strobe; the effect is self-terminating with **no looping
    motion**, and animates **transform/opacity/color on a separate overlay** so there is **no
    layout reflow**. *(consistent with D1/§7.2/AC-19 — no amendment; honors AC-29/AC-30)*
