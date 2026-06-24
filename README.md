# meshint

Ambient **mission-control** for a federated LoRa mesh — a live, client-side dashboard that
renders the "Command Center" design with **real data** from a
[potato-mesh](https://github.com/l5yth/potato-mesh) instance. Sister project to
[dweb-mesh](https://github.com/l5yth/dweb-mesh).

No backend: the browser reads potato-mesh's public GET API directly (CORS `*`) and the build
is fully static — deploy it to GitHub Pages, a Freifunk box, or drop it into a Zola site.

See [`SPEC.md`](./SPEC.md) for the locked design decisions and [`ACCEPTANCE.md`](./ACCEPTANCE.md)
for the acceptance criteria.

## Configure

The data source is configurable (default `https://dweb.potatomesh.net`):

- **Per load:** append `?api=https://your.instance` (full URL), or the shorthand
  `?d=your.instance` (bare domain → `https://`), to the dashboard URL.
- **Build default:** set `[extra].api_base` in `config.toml`.

Resolution order: `?api=` → `?d=` → `config.toml` `[extra].api_base` → built-in default.

The instance's `/version` further self-configures the UI (site name, map center, refresh
cadence, private mode). Map tiles default to CARTO dark; change `[extra].tile_url` for a
self-hosted / Freifunk tile server.

## Develop

Requires [Zola](https://www.getzola.org/) and [Deno](https://deno.com/).

```sh
zola serve                  # dev preview at http://127.0.0.1:1111
deno task check             # fmt --check + lint + test
zola build                  # → public/
sh scripts/check-offline.sh # assert no external asset/CDN references in public/
```

## Deploy

`zola build` produces a static `public/`. Serve it from any static host. For a subpath, build
with `zola build --base-url /sub/`.

## Deploying against a potato-mesh instance (CORS)

meshint runs entirely in the browser and reads the potato-mesh HTTP API **directly**, so the
browser's same-origin policy applies:

- **Same-origin** — meshint served from the *same* scheme+host+port as the instance (bundled
  into that instance's site, or behind the same domain): **nothing to configure.**
- **Cross-origin** — meshint on a different host than the instance (a standalone deploy, or
  pointing `?api=https://other.instance`): the **instance must send CORS headers** on the
  endpoints meshint reads.

meshint only issues CORS-*simple* `GET`s (just the safelisted `Accept` header — no preflight),
so the instance only needs to return `Access-Control-Allow-Origin` (e.g. `*`) on:

| Endpoint | Used for | Required cross-origin? |
|---|---|---|
| `/api/nodes`, `/api/messages`, `/api/telemetry`, `/api/instances` | all live data | **yes** |
| `/version` | self-config: poll cadence, map center, `private_mode`, max distance | recommended |

potato-mesh sends `Access-Control-Allow-Origin: *` on `/api/*`; recent versions also on
`/version` and `/metrics`. **If `/version` isn't CORS-enabled, meshint still works** — it
derives site name, channel, frequency, and map center from the instance's own entry in the
(CORS-enabled) `/api/instances` list, and defaults the poll cadence to 60s.

**Can't enable CORS on the instance?** Either deploy meshint **same-origin** with it, or put a
reverse proxy in front that serves meshint and proxies `/api` + `/version` from the instance
(same origin to the browser), or ask the instance operator to enable CORS.

## License

[Apache-2.0](./LICENSE). Bundled third-party components and runtime services are listed in
[`NOTICE`](./NOTICE).
