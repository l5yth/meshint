import { assertEquals, assertRejects } from "./assert.js";
import { buildUrl, createApiClient } from "../static/js/api.js";

Deno.test("buildUrl trims base slash and drops empty params", () => {
  assertEquals(
    buildUrl("https://x/", "/api/nodes", { limit: 100 }),
    "https://x/api/nodes?limit=100",
  );
  assertEquals(
    buildUrl("https://x", "/api/messages", { since: undefined, limit: 5 }),
    "https://x/api/messages?limit=5",
  );
});

Deno.test("client fetches JSON and builds the right URL", async () => {
  const calls = [];
  const fakeFetch = (url) => {
    calls.push(url);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ ok: 1 }]) });
  };
  const c = createApiClient({ apiBase: "https://h", fetch: fakeFetch });
  const nodes = await c.nodes({ limit: 3 });
  assertEquals(nodes, [{ ok: 1 }]);
  assertEquals(calls[0], "https://h/api/nodes?limit=3");
});

Deno.test("non-2xx throws ApiError", async () => {
  const fakeFetch = () =>
    Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
  const c = createApiClient({ apiBase: "https://h", fetch: fakeFetch });
  await assertRejects(() => c.version());
});

Deno.test("network failure throws ApiError", async () => {
  const fakeFetch = () => Promise.reject(new Error("boom"));
  const c = createApiClient({ apiBase: "https://h", fetch: fakeFetch });
  await assertRejects(() => c.instances());
});
