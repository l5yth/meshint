// SPDX-License-Identifier: Apache-2.0
import { assert, assertEquals } from "./assert.js";
import {
  normalizeInstance,
  normalizeMessage,
  normalizeNode,
  normalizeVersion,
  protocolOf,
  PROTOCOLS,
} from "../static/js/model.js";

Deno.test("normalizeNode maps core fields and protocol", () => {
  const n = normalizeNode({
    node_id: "!a1",
    short_name: "AB1",
    long_name: "alpha",
    hw_model: "RAK4631",
    role: "CLIENT",
    protocol: "meshtastic",
    snr: -13,
    last_heard: 100,
    latitude: 52.5,
    longitude: 13.4,
  });
  assertEquals(n.id, "!a1");
  assertEquals(n.long, "alpha");
  assertEquals(n.proto.tag, "MT");
  assertEquals(n.lat, 52.5);
  assertEquals(n.snr, -13);
});

Deno.test("normalizeNode tolerates missing optionals", () => {
  const n = normalizeNode({ node_id: "!b2", protocol: "meshcore" });
  assertEquals(n.batt, null);
  assertEquals(n.long, "!b2"); // falls back to id
  assertEquals(n.proto.key, "meshcore");
});

Deno.test("protocolOf is case-insensitive and falls back", () => {
  assertEquals(protocolOf("MeshTastic").key, "meshtastic");
  assertEquals(protocolOf("reticulum").color, PROTOCOLS.reticulum.color);
  assertEquals(protocolOf("weird").key, "weird");
});

Deno.test("normalizeMessage falls back from from_id to node_id", () => {
  const m = normalizeMessage({ id: 1, node_id: "!x", text: "hi", rx_time: 5 });
  assertEquals(m.fromId, "!x");
  assertEquals(m.text, "hi");
  assertEquals(m.rssi, null);
});

Deno.test("normalizeInstance reads per-protocol counts incl. reticulum", () => {
  const i = normalizeInstance({ domain: "x.net", nodes_count: 9, reticulum_nodes_count: 0 });
  assertEquals(i.name, "x.net");
  assertEquals(i.nodes, 9);
  assertEquals(i.reticulum, 0);
});

Deno.test("normalizeVersion extracts self-config", () => {
  const v = normalizeVersion({
    name: "X",
    config: {
      site_name: "X",
      refresh_interval_seconds: 30,
      map_center: { lat: 1, lon: 2 },
      private_mode: true,
      max_distance_km: 10,
    },
  });
  assertEquals(v.refreshIntervalSec, 30);
  assertEquals(v.mapCenter, { lat: 1, lon: 2 });
  assert(v.privateMode === true);
});
