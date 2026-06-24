// SPDX-License-Identifier: Apache-2.0
import { assertEquals } from "./assert.js";
import { buildTickerItems, fmtAgo, fmtClock, fmtCount, fmtRate } from "../static/js/format.js";

Deno.test("fmtCount adds thousands separators; non-finite → dash", () => {
  assertEquals(fmtCount(325), "325");
  assertEquals(fmtCount(312480), "312,480");
  assertEquals(fmtCount(null), "—");
  assertEquals(fmtCount(undefined), "—");
});

Deno.test("fmtRate shows 2 decimals for small rates, integer when large", () => {
  assertEquals(fmtRate(0), "0.00");
  assertEquals(fmtRate(0.2), "0.20");
  assertEquals(fmtRate(12.5), "12.50");
  assertEquals(fmtRate(150), "150");
  assertEquals(fmtRate(null), "—");
});

Deno.test("fmtAgo buckets seconds into s/m/h/d", () => {
  assertEquals(fmtAgo(5), "5s");
  assertEquals(fmtAgo(90), "1m");
  assertEquals(fmtAgo(7200), "2h");
  assertEquals(fmtAgo(172800), "2d");
});

Deno.test("fmtClock formats UTC from epoch-ms", () => {
  assertEquals(fmtClock(0), "00:00:00 UTC");
});

Deno.test("buildTickerItems leads with status and federation count", () => {
  const items = buildTickerItems({
    status: "live",
    instances: [1, 2, 3],
    config: { siteName: "DWeb Camp Mesh", frequency: "868MHz", channel: "#MediumFast" },
    channels: [{ name: "#a" }],
  });
  assertEquals(items[0], "SYS NOMINAL");
  assertEquals(items[1], "FEDERATION SYNC 3 INSTANCES");
  assertEquals(items.includes("LORA 868MHz"), true);
  assertEquals(items.includes("TOP CHANNEL #a"), true);
});

Deno.test("buildTickerItems reflects degraded + connecting states", () => {
  assertEquals(buildTickerItems({ status: "degraded" })[0], "SYS DEGRADED — RETRYING");
  assertEquals(buildTickerItems({ status: "connecting" })[0], "SYS CONNECTING");
});
