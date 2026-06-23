import { assert, assertEquals } from "./assert.js";
import { createStore, mergeMessages } from "../static/js/store.js";
import { createFixtureClient } from "../static/js/fixtures.js";

async function loadFixtures() {
  const read = async (f) =>
    JSON.parse(await Deno.readTextFile(new URL(`./fixtures/${f}.json`, import.meta.url)));
  return {
    version: await read("version"),
    nodes: await read("nodes"),
    messages: await read("messages"),
    telemetry: await read("telemetry"),
    instances: await read("instances"),
  };
}

const CLOCK = () => 1_782_222_000_000; // fixed ms near the fixture era

Deno.test("store loads /version config and populates state from fixtures", async () => {
  const store = createStore({ apiClient: createFixtureClient(await loadFixtures()), clock: CLOCK });
  const cfg = await store.loadConfig();
  assert(cfg.refreshIntervalSec > 0);
  await store.refresh();
  const s = store.getState();
  assertEquals(s.status, "live");
  assert(s.nodes.length > 0);
  assertEquals(s.counters.nodes, s.nodes.length);
  assert(Array.isArray(s.channels));
  assert(s.instances.length > 0);
});

Deno.test("store degrades but retains last-known data on fetch error (AC-31)", async () => {
  const base = createFixtureClient(await loadFixtures());
  let fail = false;
  const flaky = { ...base, nodes: () => fail ? Promise.reject(new Error("down")) : base.nodes() };
  const store = createStore({ apiClient: flaky, clock: CLOCK });
  await store.loadConfig();
  await store.refresh();
  const good = store.getState();
  assert(good.nodes.length > 0);

  fail = true;
  await store.refresh();
  const s = store.getState();
  assertEquals(s.status, "degraded");
  assert(s.lastError);
  assertEquals(s.nodes.length, good.nodes.length); // retained
});

Deno.test("subscribe pushes current state immediately and on update", async () => {
  const store = createStore({ apiClient: createFixtureClient(await loadFixtures()), clock: CLOCK });
  let calls = 0;
  const unsub = store.subscribe(() => calls++);
  assertEquals(calls, 1); // immediate
  await store.loadConfig();
  await store.refresh();
  assert(calls >= 2);
  unsub();
});

Deno.test("loadConfig derives config from /api/instances when /version is CORS-blocked (D8)", async () => {
  const fixtures = await loadFixtures();
  const client = {
    apiBase: "https://dweb.potatomesh.net",
    version: () => Promise.reject(new Error("CORS")),
    instances: () => Promise.resolve(fixtures.instances),
    nodes: () => Promise.resolve([]),
    messages: () => Promise.resolve([]),
    telemetry: () => Promise.resolve([]),
  };
  const store = createStore({ apiClient: client, clock: CLOCK });
  const cfg = await store.loadConfig();
  assertEquals(cfg.source, "instances");
  assertEquals(cfg.siteName, "DWeb Camp Mesh");
  assertEquals(cfg.frequency, "868MHz");
  assert(cfg.mapCenter.lat > 52 && cfg.mapCenter.lat < 53);
});

Deno.test("mergeMessages dedupes by id, sorts newest-first, and caps", () => {
  const a = [{ id: 1, rxTime: 10 }, { id: 2, rxTime: 20 }];
  const b = [{ id: 2, rxTime: 20 }, { id: 3, rxTime: 30 }];
  assertEquals(mergeMessages(a, b, 10).map((m) => m.id), [3, 2, 1]);
  assertEquals(mergeMessages(a, b, 2).length, 2);
});
