// config.js — resolve meshcom runtime configuration.
// Pure, unit-tested functions plus a thin browser binding. SPEC.md D7/D8.

export const DEFAULT_API_BASE = "https://dweb.potatomesh.net";

/** Strip trailing slashes; reject anything that isn't http(s) to the safe default. */
export function normalizeBase(url) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(u) ? u : DEFAULT_API_BASE;
}

/** Prepend https:// to a bare domain; leave full URLs untouched. */
export function withScheme(d) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(d) ? d : `https://${d}`;
}

/** Resolve the API base URL: ?api=<url> → ?d=<domain> → build config → fallback. */
export function resolveApiBase(
  { search = "", buildConfig = {}, fallback = DEFAULT_API_BASE } = {},
) {
  const params = new URLSearchParams(search);
  const api = params.get("api"); // full URL
  const domain = params.get("d"); // bare-domain deeplink, e.g. ?d=potatomesh.net
  const candidate = (api && api.trim()) ||
    (domain && domain.trim() && withScheme(domain.trim())) ||
    (buildConfig.apiBase && String(buildConfig.apiBase).trim()) ||
    fallback;
  return normalizeBase(candidate);
}

/** Resolve the full runtime config object. */
export function resolveConfig({ search = "", buildConfig = {} } = {}) {
  return {
    apiBase: resolveApiBase({ search, buildConfig }),
    tileUrl: buildConfig.tileUrl || "",
    tileAttribution: buildConfig.tileAttribution || "",
    tileSubdomains: buildConfig.tileSubdomains || "abcd",
    tileMaxZoom: Number(buildConfig.tileMaxZoom) || 19,
  };
}

/** Browser binding: read from window.location.search + the injected build config. */
export function readBrowserConfig(win) {
  const w = win || (typeof globalThis !== "undefined" ? globalThis : undefined);
  const search = (w && w.location && w.location.search) || "";
  const buildConfig = (w && w.__MESHCOM_BUILD_CONFIG__) || {};
  return resolveConfig({ search, buildConfig });
}
