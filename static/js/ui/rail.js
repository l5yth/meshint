// rail.js — left rail: protocol filter, fleet breakdown, packets/min sparkline,
// channels, federation, mesh health. SPEC.md §7, D10/D11.
import { h, mount } from "./dom.js";
import { PROTOCOL_KEYS, PROTOCOLS } from "../model.js";
import { fmtCount } from "../format.js";
import { meshHealthPct, packetSeriesPerHour, packetTimes } from "../stats.js";

export function createRail({ onToggleProtocol } = {}) {
  const el = h("div", { class: "rail" });
  let lastState = {};
  let lastActive = null;

  const sect = (t) => h("div", { class: "rl-sect px" }, t);

  function chips() {
    const fleet = lastState.fleet || {};
    return PROTOCOL_KEYS.map((k) => {
      const p = PROTOCOLS[k];
      const on = !lastActive || lastActive[k] !== false;
      const chip = h(
        "button",
        {
          class: `rl-chip mono${on ? "" : " off"}`,
          style: {
            color: on ? p.color : "var(--fg-dim)",
            borderColor: on ? "var(--line)" : "#10211a",
          },
        },
        h("span", {
          class: "rl-chip-box",
          style: {
            background: on ? p.color : "transparent",
            borderColor: p.color,
            boxShadow: on ? `0 0 6px ${p.color}` : "none",
          },
        }),
        h("span", { class: "rl-chip-k" }, k.toUpperCase()),
        h("span", { class: "rl-chip-n" }, fmtCount(fleet[k] || 0)),
      );
      chip.addEventListener("click", () => onToggleProtocol && onToggleProtocol(k));
      return chip;
    });
  }

  function bars() {
    const fleet = lastState.fleet || {};
    const max = Math.max(1, ...PROTOCOL_KEYS.map((k) => fleet[k] || 0));
    return PROTOCOL_KEYS.map((k) => {
      const p = PROTOCOLS[k];
      const w = Math.round(((fleet[k] || 0) / max) * 100);
      return h(
        "div",
        { class: "rl-bar" },
        h("div", {
          class: "rl-bar-fill",
          style: { width: `${w}%`, background: p.color, boxShadow: `0 0 6px ${p.color}` },
        }),
      );
    });
  }

  function sparkline() {
    const now = Math.floor(Date.now() / 1000);
    const series = packetSeriesPerHour(packetTimes(lastState), now, 24);
    const max = Math.max(1, ...series);
    const total = series.reduce((a, b) => a + b, 0);
    return h(
      "div",
      {
        class: "rl-spark",
        title: `packets/hr · last 24h · ${total} pkt`,
        "aria-label": `packets per hour over the last 24 hours; ${total} packets total`,
      },
      ...series.map((v, i) =>
        h("div", {
          class: "rl-spark-bar",
          style: { height: `${Math.max(1, (v / max) * 32)}px`, opacity: 0.5 + 0.5 * (i / 24) },
          title: `${v} pkt`,
        })
      ),
    );
  }

  function channels() {
    const list = (lastState.channels || []).slice(0, 7);
    return h(
      "div",
      { class: "rl-chans mono" },
      ...list.map((c) =>
        h(
          "div",
          { class: "rl-chan" },
          h("span", null, c.name),
          h("span", { class: "rl-chan-n" }, fmtCount(c.count)),
        )
      ),
    );
  }

  function render() {
    mount(
      el,
      sect("PROTOCOL FILTER"),
      ...chips(),
      sect("FLEET BREAKDOWN"),
      ...bars(),
      sect("PACKETS / HR"),
      sparkline(),
      sect("CHANNELS"),
      channels(),
      sect("FEDERATION"),
      h("div", { class: "rl-fed mono" }, `${(lastState.instances || []).length} instances`),
      sect("MESH HEALTH"),
      h("div", { class: "rl-health px" }, `${meshHealthPct(lastState.counters).toFixed(1)}%`),
    );
  }

  function update(state, active) {
    lastState = state;
    lastActive = active;
    render();
  }

  function setActive(active) {
    lastActive = active;
    render();
  }

  return { el, update, setActive };
}
