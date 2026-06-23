// topbar.js — header chrome: brand, counters, clock, LIVE/status. SPEC.md §7, D8.
// Built once; updated in place so CSS animations (the LED blink) never reset.
import { h } from "./dom.js";
import { fmtCount, fmtRate } from "../format.js";

const COUNTERS = [
  ["NODES", "nodes", "var(--cyan)", fmtCount],
  ["ONLINE", "online", "var(--fg)", fmtCount],
  ["MSGS 24H", "msgs24h", "var(--fg)", fmtCount],
  ["TELEM 24H", "telemetry", "var(--cyan)", fmtCount],
  ["PKT/HR", "pktPerHr", "var(--amber)", fmtRate],
];

const STATUS = {
  connecting: { cls: "st-connecting", label: "CONNECTING" },
  live: { cls: "st-live", label: "LIVE" },
  degraded: { cls: "st-degraded", label: "DEGRADED" },
};

export function createTopbar() {
  const values = {};
  const cell = ([label, key, col]) => {
    const v = h("div", { class: "tb-v px", style: { color: col } }, "—");
    values[key] = v;
    return h("div", { class: "tb-cell" }, h("div", { class: "tb-k" }, label), v);
  };

  const site = h("span", { class: "tb-site" }, "");
  const clock = h("div", { class: "tb-clock" }, "--:--:-- UTC");
  const stLabel = h("span", { class: "px tb-stlabel" }, STATUS.connecting.label);
  const stale = h("span", { class: "tb-stale mono" }, "");
  const status = h(
    "div",
    { class: "tb-status st-connecting" },
    h("span", { class: "tb-led" }),
    stLabel,
    stale,
  );

  const el = h(
    "header",
    { class: "topbar" },
    h("div", { class: "tb-brand px" }, h("span", { class: "tb-dot" }), "MESHCOM", site),
    h("div", { class: "tb-counters" }, ...COUNTERS.map(cell)),
    h("div", { class: "tb-spacer" }),
    clock,
    status,
  );

  function update(state) {
    const c = state.counters || {};
    for (const [, key, , fmt] of COUNTERS) values[key].textContent = fmt(c[key]);
    site.textContent = (state.config && state.config.siteName) || "";
    const st = STATUS[state.status] || STATUS.connecting;
    status.className = `tb-status ${st.cls}`;
    stLabel.textContent = st.label;
  }

  function setClock(text) {
    clock.textContent = text;
  }

  function setStale(text) {
    stale.textContent = text || "";
  }

  return { el, update, setClock, setStale };
}
