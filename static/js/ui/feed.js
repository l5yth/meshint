// SPDX-License-Identifier: Apache-2.0
// feed.js — live message feed (SPEC.md §7). Newest-first, pausable, honors
// private_mode, and respects the rail's protocol filter. Message text is rendered
// as a text node (never HTML).
import { h } from "./dom.js";
import { fmtAgo, fmtRate } from "../format.js";
import { nodesById, protoEnabled, senderLabel } from "../feedutil.js";

const PAUSE = "❚❚ PAUSE";
const RESUME = "▶ RESUME";
const MAX_ROWS = 40;

export function createFeed() {
  let paused = false;
  let lastState = {};
  let lastActive = null;

  const rate = h("span", { class: "fd-rate mono" }, "0 pkt/hr");
  const pauseBtn = h("button", { class: "fd-pause mono" }, PAUSE);
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? RESUME : PAUSE;
    if (!paused) renderIfLive();
  });

  const list = h("div", { class: "fd-list scrl" });
  const el = h(
    "section",
    { class: "fd" },
    h(
      "div",
      { class: "fd-head" },
      h("span", { class: "fd-led" }),
      h("span", { class: "px fd-title" }, "LIVE FEED"),
      rate,
      pauseBtn,
    ),
    list,
  );

  function row(m, i, byId, now) {
    const color = (m.proto && m.proto.color) || "#62b0c4";
    const ago = m.rxTime == null ? "—" : (now - m.rxTime < 3 ? "now" : fmtAgo(now - m.rxTime));
    const snr = m.snr == null ? "—" : `${m.snr > 0 ? "+" : ""}${m.snr}`;
    return h(
      "div",
      { class: "fd-msg", style: i === 0 ? { animation: "feedin .45s ease both" } : null },
      h(
        "div",
        { class: "fd-meta" },
        h("span", { class: "fd-dot", style: { background: color, boxShadow: `0 0 5px ${color}` } }),
        h(
          "span",
          { class: "fd-ch mono", style: { color } },
          m.channelName || `ch${m.channel ?? "?"}`,
        ),
        h("span", { class: "fd-from mono" }, senderLabel(m, byId)),
        h("span", {
          class: "fd-ago mono",
          dataset: { rx: m.rxTime == null ? "" : String(m.rxTime) },
        }, ago),
      ),
      h("div", { class: "fd-text mono" }, m.text || ""),
      h(
        "div",
        { class: "fd-sig mono" },
        h("span", null, `SNR ${snr}`),
        h("span", null, `RSSI ${m.rssi == null ? "—" : m.rssi}`),
      ),
    );
  }

  function renderList() {
    const byId = nodesById(lastState.nodes || []);
    const now = Math.floor(Date.now() / 1000);
    const msgs = (lastState.messages || []).filter((m) => protoEnabled(m, lastActive)).slice(
      0,
      MAX_ROWS,
    );
    list.replaceChildren(...msgs.map((m, i) => row(m, i, byId, now)));
  }

  function renderIfLive() {
    if (lastState.config && lastState.config.privateMode) {
      list.replaceChildren(
        h("div", { class: "fd-empty mono" }, "messages disabled (private_mode)"),
      );
      return;
    }
    if (paused) return; // freeze the stream
    renderList();
  }

  function update(state, active) {
    lastState = state;
    lastActive = active;
    rate.textContent = `${fmtRate((state.counters && state.counters.pktPerHr) || 0)} pkt/hr`;
    renderIfLive();
  }

  function setActive(active) {
    lastActive = active;
    renderIfLive();
  }

  // Refresh just the age labels in place (~1/s) so "now / 5s / 12m" stays current
  // between 60s polls — no list re-render, no scroll reset.
  function tickAges() {
    const now = Math.floor(Date.now() / 1000);
    for (const span of list.querySelectorAll(".fd-ago")) {
      const rx = Number(span.dataset.rx);
      if (!rx) continue;
      span.textContent = now - rx < 3 ? "now" : fmtAgo(now - rx);
    }
  }

  return { el, update, setActive, tickAges };
}
