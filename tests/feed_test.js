// SPDX-License-Identifier: Apache-2.0
import { assertEquals } from "./assert.js";
import { nodesById, protoEnabled, senderLabel } from "../static/js/feedutil.js";

Deno.test("protoEnabled respects the active filter; unknown protocols pass", () => {
  const active = { meshtastic: true, meshcore: false, reticulum: true };
  assertEquals(protoEnabled({ proto: { key: "meshtastic" } }, active), true);
  assertEquals(protoEnabled({ proto: { key: "meshcore" } }, active), false);
  assertEquals(protoEnabled({ proto: { key: "weird" } }, active), true);
  assertEquals(protoEnabled({ proto: { key: "meshcore" } }, null), true); // no filter → all pass
});

Deno.test("nodesById indexes nodes by id", () => {
  const idx = nodesById([{ id: "!a", short: "AA" }, { id: "!b", short: "BB" }, { id: null }]);
  assertEquals(idx.size, 2);
  assertEquals(idx.get("!a").short, "AA");
});

Deno.test("senderLabel prefers short name, then long, then raw id", () => {
  const idx = nodesById([{ id: "!a", short: "AA", long: "alpha" }, { id: "!b", long: "bravo" }]);
  assertEquals(senderLabel({ fromId: "!a" }, idx), "AA");
  assertEquals(senderLabel({ fromId: "!b" }, idx), "bravo");
  assertEquals(senderLabel({ fromId: "!unknown" }, idx), "!unknown");
  assertEquals(senderLabel({ nodeId: "!a" }, idx), "AA"); // falls back to nodeId
});
