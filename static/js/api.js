// SPDX-License-Identifier: Apache-2.0
// api.js — potato-mesh HTTP client. Pure URL builder + a fetch-injected client.
// SPEC.md §5, D7. GET-only; meshint never writes to the API.

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

  // Backward cursor pagination via `before` (cursor = the endpoint's ORDER BY field).
  // Pages until exhausted, deduping the inclusive boundary row. Forward-compatible and
  // safe: if an endpoint ignores `before`, the repeated page adds no new ids and the
  // loop stops. SPEC.md §5.
  async function pageAll(
    path,
    { cursorField, idField = "id", params = {}, limit = 1000, maxPages = 12 } = {},
  ) {
    const out = [];
    const seen = new Set();
    let before;
    for (let page = 0; page < maxPages; page++) {
      const batch = await getJson(path, { ...params, limit, before });
      if (!Array.isArray(batch) || batch.length === 0) break;
      let minCursor = Infinity;
      let added = 0;
      for (const row of batch) {
        const cv = row[cursorField];
        if (typeof cv === "number" && cv < minCursor) minCursor = cv;
        const key = row[idField];
        if (key == null) {
          out.push(row);
          added++;
        } else if (!seen.has(key)) {
          seen.add(key);
          out.push(row);
          added++;
        }
      }
      if (batch.length < limit || added === 0 || !Number.isFinite(minCursor)) break;
      before = minCursor;
    }
    return out;
  }

  return {
    apiBase,
    version: () => getJson(ENDPOINTS.version),
    // Each page caps at 1000 upstream. All three page backward via `before`, cursored on
    // the endpoint's ORDER BY field — last_heard for nodes, rx_time for messages/telemetry.
    // Messages support it today; once nodes/telemetry get `before` upstream this paginates
    // them automatically (until then a single page is returned).
    nodes: ({ limit = 1000, maxPages = 12 } = {}) =>
      pageAll(ENDPOINTS.nodes, { cursorField: "last_heard", idField: "node_id", limit, maxPages }),
    messages: ({ limit = 1000, since = 0, encrypted = false, maxPages = 12 } = {}) =>
      pageAll(ENDPOINTS.messages, {
        cursorField: "rx_time",
        params: { since, encrypted },
        limit,
        maxPages,
      }),
    telemetry: ({ limit = 1000, maxPages = 8 } = {}) =>
      pageAll(ENDPOINTS.telemetry, { cursorField: "rx_time", limit, maxPages }),
    instances: () => getJson(ENDPOINTS.instances),
  };
}
