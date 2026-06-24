// SPDX-License-Identifier: Apache-2.0
// ticker.js — scrolling status ticker. SPEC.md §7, D11.
// Re-renders the marquee only when the item set actually changes, so the scroll
// animation isn't restarted on every poll.
import { h } from "./dom.js";
import { buildTickerItems } from "../format.js";

export function createTicker() {
  const track = h("div", { class: "tk-track" });
  const el = h("footer", { class: "ticker mono" }, track);
  let key = "";

  function seq(items) {
    return h(
      "span",
      { class: "tk-seq" },
      h("span", { class: "tk-caret" }, "> "),
      ...items.map((t) =>
        h("span", { class: "tk-item" }, t, h("span", { class: "tk-sep" }, "   ·   "))
      ),
    );
  }

  function update(state) {
    const items = buildTickerItems(state);
    const k = items.join("|");
    if (k === key) return;
    key = k;
    // two identical sequences → seamless -50% marquee
    track.replaceChildren(seq(items), seq(items));
  }

  return { el, update };
}
