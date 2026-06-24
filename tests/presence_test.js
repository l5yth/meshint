// SPDX-License-Identifier: Apache-2.0
import { assert, assertEquals } from "./assert.js";
import { computePresence, latestMessageBySender } from "../static/js/presence.js";

const NOW = 1_000_000;
const H = 3600;

Deno.test("node with a recent advert is online", () => {
  const { nodes, onlineCount } = computePresence([{ id: "!a", lastHeard: NOW - H }], [], NOW);
  assert(nodes[0].online);
  assertEquals(onlineCount, 1);
});

Deno.test("stale advert but recent chat → ONLINE (the MeshCore case, AC-14)", () => {
  const nodes = [{ id: "!mc", lastHeard: NOW - 50 * H }]; // advert 50h old (beyond the window)
  const messages = [{ fromId: "!mc", rxTime: NOW - H }]; // but chatted 1h ago
  const { nodes: out, onlineCount } = computePresence(nodes, messages, NOW);
  assert(out[0].online, "chat activity must make it online");
  assertEquals(out[0].lastActivity, NOW - H);
  assertEquals(onlineCount, 1);
});

Deno.test("silent and no messages beyond the window → offline", () => {
  const { onlineCount } = computePresence([{ id: "!z", lastHeard: NOW - 50 * H }], [], NOW);
  assertEquals(onlineCount, 0);
});

Deno.test("a node with no activity at all is offline", () => {
  const { nodes } = computePresence([{ id: "!none" }], [], NOW);
  assertEquals(nodes[0].online, false);
});

Deno.test("latestMessageBySender keeps the max rx_time per sender", () => {
  const m = latestMessageBySender([
    { fromId: "!a", rxTime: 10 },
    { fromId: "!a", rxTime: 30 },
    { fromId: "!b", rxTime: 5 },
  ]);
  assertEquals(m.get("!a"), 30);
  assertEquals(m.get("!b"), 5);
});
