# CLAUDE.md — meshint

meshint is a live, client-side **ambient mission-control** dashboard for a LoRa mesh
community/camp, rendering the "Command Center" design with real data from a **potato-mesh**
instance. Sister project to `l5yth/dweb-mesh`.

**Source of truth:** `SPEC.md` (locked decisions D1–D18) and `ACCEPTANCE.md` (AC-1…AC-37).
Re-read both before non-trivial work; do not drift without re-confirmation.

## Hard rules
- **Vanilla JS (ES modules) only** — no React/Vue/Svelte/Preact. Port the mockup's logic to DOM.
- **No CDNs / no external origins** in built output except (a) the configured potato-mesh API
  and (b) the configured map-tile URL. Vendor Leaflet + fonts locally; keep `scripts/check-offline.sh` green.
- **Apache-2.0.** Keep LICENSE; add SPDX headers to source files.
- **No backend.** Read only public GET endpoints; never POST/write to the API.
- **Static output** via Zola; deployable to any static host.

## Data source
Configurable base URL (default `https://dweb.potatomesh.net`; CORS `*`). Self-config from
`/version` (site_name, map_center, max_distance_km, refresh_interval_seconds, private_mode).
Endpoints + field shapes in `SPEC.md` §5–§6. **Online** = activity (latest of `last_heard` or a
node's recent message `rx_time`) within **48h**.

## Build / test / run
- `zola build` → `public/`; `zola serve` for dev preview.
- Unit-test data transforms (documented runner) — must pass.
- Lint/format — must be clean.
- `scripts/check-offline.sh` — asserts no disallowed remote origins.
- CI (GitHub Actions) runs build + tests + offline-check.

## Conventions
- Match dweb-mesh layout: `content/ templates/ static/{css,js,fonts,vendor} scripts/`.
- Keep the data **transport swappable** (poll now; SSE/WebSocket pubsub later) — never couple UI to polling.
- Commit only when asked; branch off `main`; never force-push or rewrite shared history.
