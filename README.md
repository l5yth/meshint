# meshcom

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

- **Per load:** append `?api=https://your.instance` to the URL.
- **Build default:** set `[extra].api_base` in `config.toml`.

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

## License

[Apache-2.0](./LICENSE). Bundled third-party components and runtime services are listed in
[`NOTICE`](./NOTICE).
