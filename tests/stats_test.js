import { assertEquals } from "./assert.js";
import {
  computeChannels,
  computeCounters,
  computeFleetBreakdown,
  computePacketRate,
  countSince,
  meshHealthPct,
  packetSeriesPerHour,
  packetTimes,
} from "../static/js/stats.js";
import { protocolOf } from "../static/js/model.js";

const NOW = 1_000_000;

Deno.test("countSince respects the cutoff", () => {
  const items = [{ rxTime: NOW - 10 }, { rxTime: NOW - 100 }, { rxTime: NOW - 100000 }];
  assertEquals(countSince(items, NOW, 3600), 2);
});

Deno.test("packetTimes merges message + telemetry timestamps, dropping nulls", () => {
  assertEquals(
    packetTimes({ messages: [{ rxTime: 10 }, { rxTime: null }], telemetry: [{ rxTime: 20 }] }),
    [10, 20],
  );
});

Deno.test("computePacketRate scales packets to per-hour over the window", () => {
  assertEquals(computePacketRate([NOW - 10, NOW - 20, NOW - 30], NOW, 3600), 3); // 3 in last hour → 3/hr
  const day = Array.from({ length: 48 }, (_, i) => NOW - i * 1500); // 48 across ~20h
  assertEquals(computePacketRate(day, NOW, 86400), 2); // 48 / 24 = 2 per hour
});

Deno.test("packetSeriesPerHour bins packets into the last N hours", () => {
  const s = packetSeriesPerHour([NOW - 100, NOW - 4000, NOW - 4000, NOW - 80000], NOW, 24);
  assertEquals(s.length, 24);
  assertEquals(s[23], 1); // newest hour
  assertEquals(s[22], 2); // previous hour (two packets)
  assertEquals(s.reduce((a, b) => a + b, 0), 4);
});

Deno.test("computeCounters computes the five counters", () => {
  const messages = [{ rxTime: NOW - 30 }, { rxTime: NOW - 50 }, { rxTime: NOW - 7200 }];
  const telemetry = [{ rxTime: NOW - 100 }];
  const c = computeCounters({ nodes: [1, 2, 3], messages, telemetry, onlineCount: 2, nowSec: NOW });
  assertEquals(c.nodes, 3);
  assertEquals(c.online, 2);
  assertEquals(c.msgs24h, 3);
  assertEquals(c.telemetry, 1);
  assertEquals(c.pktPerHr.toFixed(2), "0.17"); // 4 packets in 24h / 24
});

Deno.test("fleet breakdown counts per protocol, reticulum present at 0", () => {
  const nodes = [
    { proto: protocolOf("meshtastic") },
    { proto: protocolOf("meshtastic") },
    { proto: protocolOf("meshcore") },
  ];
  const f = computeFleetBreakdown(nodes);
  assertEquals(f.meshtastic, 2);
  assertEquals(f.meshcore, 1);
  assertEquals(f.reticulum, 0);
});

Deno.test("channels are sorted by count descending", () => {
  const ch = computeChannels([{ channelName: "#a" }, { channelName: "#b" }, { channelName: "#a" }]);
  assertEquals(ch[0], { name: "#a", count: 2 });
  assertEquals(ch[1], { name: "#b", count: 1 });
});

Deno.test("meshHealthPct is the online/nodes percentage, 0 when no nodes", () => {
  assertEquals(meshHealthPct({ online: 243, nodes: 324 }).toFixed(1), "75.0");
  assertEquals(meshHealthPct({ online: 0, nodes: 0 }), 0);
});
