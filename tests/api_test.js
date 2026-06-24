// SPDX-License-Identifier: Apache-2.0
import { assert, assertEquals, assertRejects } from "./assert.js";
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

Deno.test("messages() pages backward via `before` until exhausted, deduping the boundary", async () => {
  const calls = [];
  const fakeFetch = (url) => {
    calls.push(url);
    const before = new URL(url).searchParams.get("before");
    // page 0: ids 1..1000 (rx 2000..1001). page 1 (before=1001): id 1000 (boundary dup)
    // + ids 1001..1499 → 500 rows (< limit ⇒ last page).
    const batch = before
      ? Array.from({ length: 500 }, (_, i) => ({ id: 1000 + i, rx_time: 1001 - i }))
      : Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, rx_time: 2000 - i }));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(batch) });
  };
  const c = createApiClient({ apiBase: "https://h", fetch: fakeFetch });
  const msgs = await c.messages({ limit: 1000, since: 0 });
  assertEquals(msgs.length, 1499); // 1000 + 499 new (boundary id 1000 deduped)
  assertEquals(new Set(msgs.map((m) => m.id)).size, 1499);
  assert(calls[1].includes("before=1001"), "second page uses the oldest rx_time as cursor");
});

Deno.test("nodes() pages via `before` on last_heard (cursor activates when upstream supports it)", async () => {
  const calls = [];
  const fakeFetch = (url) => {
    calls.push(url);
    const before = new URL(url).searchParams.get("before");
    const batch = before
      ? Array.from({ length: 400 }, (_, i) => ({ node_id: "!" + (1000 + i), last_heard: 5000 - i }))
      : Array.from({ length: 1000 }, (_, i) => ({ node_id: "!" + i, last_heard: 9000 - i }));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(batch) });
  };
  const c = createApiClient({ apiBase: "https://h", fetch: fakeFetch });
  const nodes = await c.nodes({ limit: 1000 });
  assertEquals(nodes.length, 1400); // 1000 + 400 distinct node_ids
  assert(calls[1].includes("before=8001"), "cursor = oldest last_heard of page 0 (9000-999)");
});
