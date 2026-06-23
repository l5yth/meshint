// Unit tests for the config resolver (ACCEPTANCE AC-10).
import { assertEquals } from "./assert.js";
import {
  DEFAULT_API_BASE,
  normalizeBase,
  resolveApiBase,
  resolveConfig,
} from "../static/js/config.js";

Deno.test("?api= overrides the build default", () => {
  assertEquals(
    resolveApiBase({
      search: "?api=https://a.example",
      buildConfig: { apiBase: "https://b.example" },
    }),
    "https://a.example",
  );
});

Deno.test("?d= deep-links a bare domain (https:// prepended, trailing slash trimmed)", () => {
  assertEquals(resolveApiBase({ search: "?d=potatomesh.net" }), "https://potatomesh.net");
  assertEquals(resolveApiBase({ search: "?d=my.mesh.example/" }), "https://my.mesh.example");
});

Deno.test("?api= takes precedence over ?d=", () => {
  assertEquals(
    resolveApiBase({ search: "?api=https://a.example&d=b.example" }),
    "https://a.example",
  );
});

Deno.test("?d= with an explicit scheme is left untouched", () => {
  assertEquals(resolveApiBase({ search: "?d=http://x.example" }), "http://x.example");
});

Deno.test("build default is used when no query param", () => {
  assertEquals(
    resolveApiBase({ search: "", buildConfig: { apiBase: "https://b.example" } }),
    "https://b.example",
  );
});

Deno.test("falls back to DEFAULT_API_BASE when nothing is set", () => {
  assertEquals(resolveApiBase({ search: "", buildConfig: {} }), DEFAULT_API_BASE);
});

Deno.test("trailing slashes are normalized away", () => {
  assertEquals(normalizeBase("https://x.example/"), "https://x.example");
  assertEquals(normalizeBase("https://x.example///"), "https://x.example");
});

Deno.test("non-http(s) input is rejected to the safe default", () => {
  assertEquals(normalizeBase("javascript:alert(1)"), DEFAULT_API_BASE);
  assertEquals(normalizeBase(""), DEFAULT_API_BASE);
});

Deno.test("resolveConfig carries tile settings through", () => {
  const cfg = resolveConfig({
    search: "",
    buildConfig: {
      apiBase: "https://b.example",
      tileUrl: "https://t/{z}",
      tileAttribution: "X",
      tileMaxZoom: 16,
    },
  });
  assertEquals(cfg.apiBase, "https://b.example");
  assertEquals(cfg.tileUrl, "https://t/{z}");
  assertEquals(cfg.tileAttribution, "X");
  assertEquals(cfg.tileMaxZoom, 16);
});
