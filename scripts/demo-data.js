// SPDX-License-Identifier: Apache-2.0
// scripts/demo-data.js — Bucket 1 live demo. Runs the REAL data layer against a
// potato-mesh instance and prints the computed state. No UI.
//   deno run --allow-net scripts/demo-data.js [apiBase]
import { createApiClient } from "../static/js/api.js";
import { normalizeMessage, normalizeNode, normalizeTelemetry } from "../static/js/model.js";
import { computePresence } from "../static/js/presence.js";
import { computeChannels, computeCounters, computeFleetBreakdown } from "../static/js/stats.js";

const apiBase = Deno.args[0] || "https://dweb.potatomesh.net";
const client = createApiClient({ apiBase });
const now = Math.floor(Date.now() / 1000);

const [rawNodes, rawMsgs, rawTele] = await Promise.all([
  client.nodes(),
  client.messages({ since: now - 86400 }),
  client.telemetry(),
]);

const nodes0 = rawNodes.map(normalizeNode);
const messages = rawMsgs.map(normalizeMessage);
const telemetry = rawTele.map(normalizeTelemetry);
const { nodes, onlineCount } = computePresence(nodes0, messages, now);
const counters = computeCounters({ nodes, messages, telemetry, onlineCount, nowSec: now });

console.log("api:     ", apiBase);
console.log("counters:", JSON.stringify(counters));
console.log("fleet:   ", JSON.stringify(computeFleetBreakdown(nodes)));
console.log("channels:", JSON.stringify(computeChannels(messages).slice(0, 6)));
console.log(`online:   ${onlineCount}/${nodes.length} nodes`);
for (const n of nodes.filter((x) => x.online).slice(0, 6)) {
  const ago = now - (n.lastActivity || now);
  console.log(
    `  ${n.id}  ${String(n.long).padEnd(20)} ${n.proto.tag.padEnd(3)} snr=${n.snr} seen=${ago}s`,
  );
}
