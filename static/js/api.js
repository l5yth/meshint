// api.js — potato-mesh HTTP client. Pure URL builder + a fetch-injected client.
// SPEC.md §5, D7. GET-only; meshcom never writes to the API.

export const ENDPOINTS = {
  version: "/version",
  nodes: "/api/nodes",
  messages: "/api/messages",
  telemetry: "/api/telemetry",
  instances: "/api/instances",
  positions: "/api/positions",
  neighbors: "/api/neighbors",
  traces: "/api/traces",
};

/** Build a request URL, dropping empty params. Pure + unit-tested. */
export function buildUrl(apiBase, path, params = {}) {
  const base = String(apiBase || "").replace(/\/+$/, "");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const q = qs.toString();
  return `${base}${path}${q ? "?" + q : ""}`;
}

export class ApiError extends Error {
  constructor(message, { status = 0, url = "", cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    if (cause) this.cause = cause;
  }
}

export function createApiClient({ apiBase, fetch: fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (!doFetch) throw new Error("createApiClient: no fetch available");

  async function getJson(path, params) {
    const url = buildUrl(apiBase, path, params);
    let res;
    try {
      res = await doFetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new ApiError(`network error for ${path}`, { url, cause: err });
    }
    if (!res.ok) throw new ApiError(`HTTP ${res.status} for ${path}`, { status: res.status, url });
    return await res.json();
  }

  return {
    apiBase,
    version: () => getJson(ENDPOINTS.version),
    nodes: ({ limit = 2000 } = {}) => getJson(ENDPOINTS.nodes, { limit }),
    messages: ({ limit = 500, since, encrypted = false } = {}) =>
      getJson(ENDPOINTS.messages, { limit, since, encrypted }),
    telemetry: ({ limit = 2000 } = {}) => getJson(ENDPOINTS.telemetry, { limit }),
    instances: () => getJson(ENDPOINTS.instances),
  };
}
