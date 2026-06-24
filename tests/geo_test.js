// SPDX-License-Identifier: Apache-2.0
import { assert, assertEquals } from "./assert.js";
import { boundsOf, esc, fmtLatLon, popupHtml } from "../static/js/geo.js";

Deno.test("boundsOf ignores invalid coords and returns the extent", () => {
  const b = boundsOf([{ lat: 52, lon: 13 }, { lat: 53, lon: 12 }, { lat: null, lon: 5 }]);
  assertEquals(b.minLat, 52);
  assertEquals(b.maxLat, 53);
  assertEquals(b.minLon, 12);
  assertEquals(b.maxLon, 13);
  assertEquals(b.count, 2);
});

Deno.test("boundsOf returns null when nothing has coords", () => {
  assertEquals(boundsOf([{ lat: null, lon: null }, {}]), null);
});

Deno.test("fmtLatLon picks hemisphere letters", () => {
  assertEquals(fmtLatLon(52.1185, 12.4065), "52.1185°N  12.4065°E");
  assertEquals(fmtLatLon(-33.9, -18.4), "33.9000°S  18.4000°W");
  assertEquals(fmtLatLon(null, 1), "—");
});

Deno.test("esc neutralizes HTML", () => {
  assertEquals(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

Deno.test("popupHtml renders fields, escapes text, dashes null snr/batt", () => {
  const html = popupHtml({
    id: "!a",
    long: "Café <x>",
    short: "AB",
    role: "CLIENT",
    hw: "RAK",
    proto: { key: "meshcore", color: "#6fe6ff" },
    snr: null,
    batt: null,
    lastActivity: 100,
  }, 160);
  assert(html.includes("meshcore"));
  assert(html.includes("Café &lt;x&gt;"));
  assert(html.includes(`SNR </span><span`));
  assert(html.includes("—")); // null snr/batt
  assert(html.includes("SEEN </span>1m")); // 160-100 = 60s → 1m
});
