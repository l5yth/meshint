// SPDX-License-Identifier: Apache-2.0
import { assertEquals } from "./assert.js";
import { filterSortNodes } from "../static/js/roster.js";

const N = [
  {
    id: "!a1",
    long: "alpha",
    short: "AL",
    hw: "RAK4631",
    role: "ROUTER",
    proto: { key: "meshtastic", tag: "MT" },
    snr: 5,
    batt: 80,
    lastActivity: 300,
  },
  {
    id: "!b2",
    long: "bravo",
    short: "BR",
    hw: "TBEAM",
    role: "CLIENT",
    proto: { key: "meshcore", tag: "MC" },
    snr: -8,
    batt: 20,
    lastActivity: 100,
  },
  {
    id: "!c3",
    long: "charlie",
    short: "CH",
    hw: "HELTEC_V3",
    role: "CLIENT",
    proto: { key: "meshtastic", tag: "MT" },
    snr: null,
    batt: null,
    lastActivity: 200,
  },
];

Deno.test("search matches id/name/hw/role, case-insensitive", () => {
  assertEquals(filterSortNodes(N, { q: "rak" }).map((n) => n.id), ["!a1"]);
  assertEquals(filterSortNodes(N, { q: "CLIENT" }).map((n) => n.id).sort(), ["!b2", "!c3"]);
  assertEquals(filterSortNodes(N, { q: "charlie" }).map((n) => n.id), ["!c3"]);
});

Deno.test("protocol filter excludes disabled protocols", () => {
  const out = filterSortNodes(N, {
    active: { meshtastic: true, meshcore: false, reticulum: true },
  });
  assertEquals(out.map((n) => n.id).sort(), ["!a1", "!c3"]);
});

Deno.test("sort by ago desc shows most-recent first", () => {
  assertEquals(filterSortNodes(N, { sortKey: "ago", sortDir: -1 }).map((n) => n.id), [
    "!a1",
    "!c3",
    "!b2",
  ]);
});

Deno.test("sort by snr asc keeps nulls last", () => {
  assertEquals(filterSortNodes(N, { sortKey: "snr", sortDir: 1 }).map((n) => n.id), [
    "!b2",
    "!a1",
    "!c3",
  ]);
});
