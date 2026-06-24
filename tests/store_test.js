// SPDX-License-Identifier: Apache-2.0
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

// ---- collection-targeted refetch + diff channel (D25/D27/D28) ----

function rawNode(id, lat, lon, lastHeard) {
  return {
    node_id: id,
    short_name: id,
    latitude: lat,
    longitude: lon,
    last_heard: lastHeard,
    protocol: "meshtastic",
  };
}
function rawMsg(id, rxTime, from) {
  return {
    id,
    rx_time: rxTime,
    from_id: from,
    channel: 0,
    channel_name: "#x",
    text: "hi",
    protocol: "meshtastic",
  };
}

/** A client whose data can be swapped between calls, counting calls per endpoint. */
function mutableClient(data, version = { name: "x", config: { site_name: "x" } }) {
  const calls = { version: 0, nodes: 0, messages: 0, telemetry: 0, instances: 0 };
  return {
    apiBase: "https://x.example",
    calls,
    data,
    version: () => {
      calls.version++;
      return Promise.resolve(version);
    },
    nodes: () => {
      calls.nodes++;
      return Promise.resolve(data.nodes);
    },
    messages: () => {
      calls.messages++;
      return Promise.resolve(data.messages);
    },
    telemetry: () => {
      calls.telemetry++;
      return Promise.resolve(data.telemetry);
    },
    instances: () => {
      calls.instances++;
      return Promise.resolve(data.instances);
    },
  };
}

Deno.test("applyChange refetches only the named collection and emits a node diff", async () => {
  const data = {
    nodes: [rawNode("a", 52.1, 13.1, 1_782_221_000)],
    messages: [],
    telemetry: [],
    instances: [],
  };
  const api = mutableClient(data);
  const store = createStore({ apiClient: api, clock: CLOCK });
  const diffs = [];
  store.subscribeChanges((d) => diffs.push(d));
  await store.refresh(); // initial populate — no flash
  assertEquals(diffs.length, 0);

  const before = { ...api.calls };
  data.nodes = [rawNode("a", 52.5, 13.5, 1_782_221_500)]; // moved + re-heard
  await store.applyChange(["nodes"]);

  assertEquals(api.calls.nodes, before.nodes + 1); // refetched nodes
  assertEquals(api.calls.messages, before.messages); // and nothing else
  assertEquals(api.calls.telemetry, before.telemetry);
  assertEquals(api.calls.instances, before.instances);
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0].nodeIds, ["a"]);
  assertEquals(diffs[0].messageIds, []);
});

Deno.test("applyChange messages emits new ids + sender; positions maps to nodes", async () => {
  const data = {
    nodes: [rawNode("a", 52.1, 13.1, 1_782_221_000)],
    messages: [rawMsg(1, 1_782_221_400, "a")],
    telemetry: [],
    instances: [],
  };
  const api = mutableClient(data);
  const store = createStore({ apiClient: api, clock: CLOCK });
  const diffs = [];
  store.subscribeChanges((d) => diffs.push(d));
  await store.refresh();
  assertEquals(diffs.length, 0);

  data.messages = [rawMsg(1, 1_782_221_400, "a"), rawMsg(2, 1_782_221_800, "a")];
  await store.applyChange(["messages"]);
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0].messageIds, [2]);
  assertEquals(diffs[0].senderIds, ["a"]);
  assertEquals(diffs[0].nodeIds, ["a"]); // sender's lastActivity advanced → its marker flashes too

  // "positions" is a node move → triggers a nodes refetch, not a messages one.
  const before = { ...api.calls };
  data.nodes = [rawNode("a", 52.9, 13.9, 1_782_221_900)];
  await store.applyChange(["positions"]);
  assertEquals(api.calls.nodes, before.nodes + 1);
  assertEquals(api.calls.messages, before.messages);
});

Deno.test("no flash diff is emitted on the initial populate (D28)", async () => {
  const api = mutableClient({
    nodes: [rawNode("a", 52.1, 13.1, 1_782_221_000), rawNode("b", 52.2, 13.2, 1_782_221_100)],
    messages: [rawMsg(1, 1_782_221_400, "a")],
    telemetry: [],
    instances: [],
  });
  const store = createStore({ apiClient: api, clock: CLOCK });
  const diffs = [];
  store.subscribeChanges((d) => diffs.push(d));
  await store.refresh();
  assertEquals(diffs.length, 0); // two nodes + a message appeared, but no flash on load
});

Deno.test("applyChange ignores change:messages under private_mode (AC-12)", async () => {
  const api = mutableClient(
    {
      nodes: [rawNode("a", 52.1, 13.1, 1_782_221_000)],
      messages: [],
      telemetry: [],
      instances: [],
    },
    { name: "x", config: { site_name: "x", private_mode: true } },
  );
  const store = createStore({ apiClient: api, clock: CLOCK });
  const cfg = await store.loadConfig();
  assert(cfg.privateMode);
  await store.refresh();
  const diffs = [];
  store.subscribeChanges((d) => diffs.push(d));
  const before = { ...api.calls };
  await store.applyChange(["messages"]);
  assertEquals(api.calls.messages, before.messages); // no /api/messages request made
  assertEquals(diffs.length, 0); // nothing changed, nothing flashed
});
