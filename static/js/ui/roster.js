// roster.js (ui) — searchable, sortable, virtual-scrolled node table. SPEC.md §7.
// Renders only the visible row window for smooth perf over the full fleet (AC-26).
import { h } from "./dom.js";
import { COLUMNS, filterSortNodes } from "../roster.js";
import { fmtAgo, fmtCount } from "../format.js";

const ROW_H = 26;
const GRID = COLUMNS.map((c) => c.w).join(" ");

export function createRoster({ onFocus } = {}) {
  let nodes = [];
  let active = null;
  let q = "";
  let sortKey = "ago";
  let sortDir = -1; // most-recent first
  let scrollTop = 0;

  const search = h("input", {
    class: "rs-search mono",
    placeholder: "search id / name / hw / role",
    value: "",
  });
  search.addEventListener("input", (e) => {
    q = e.target.value;
    scrollTop = 0;
    body.scrollTop = 0;
    render();
  });

  const count = h("span", { class: "rs-count mono" }, "0 / 0");
  const sortLabel = h("span", { class: "rs-sortlabel mono" }, "");
  const head = h("div", { class: "rs-head", style: { gridTemplateColumns: GRID } });
  const inner = h("div", { class: "rs-body-inner" });
  const body = h("div", { class: "rs-body scrl" }, inner);
  body.addEventListener("scroll", () => {
    scrollTop = body.scrollTop;
    renderRows();
  });

  const el = h(
    "section",
    { class: "rs" },
    h(
      "div",
      { class: "rs-toolbar" },
      h("span", { class: "px rs-title" }, "NODE ROSTER"),
      h("div", { class: "rs-searchbox" }, h("span", { class: "rs-ent mono" }, "⏎"), search),
      count,
      sortLabel,
    ),
    head,
    body,
  );

  function setSort(key) {
    if (sortKey === key) sortDir = -sortDir;
    else {
      sortKey = key;
      sortDir = 1;
    }
    scrollTop = 0;
    body.scrollTop = 0;
    renderHead();
    render();
  }

  function renderHead() {
    head.replaceChildren(...COLUMNS.map((c) => {
      const on = sortKey === c.key;
      const btn = h(
        "button",
        { class: `rs-col mono${on ? " active" : ""}` },
        c.label,
        on ? h("span", null, sortDir > 0 ? "▲" : "▼") : null,
      );
      btn.addEventListener("click", () => setSort(c.key));
      return btn;
    }));
  }

  function rowEl(n, index) {
    const now = Math.floor(Date.now() / 1000);
    const color = (n.proto && n.proto.color) || "#62b0c4";
    const snrCol = n.snr == null
      ? "var(--cyan-dim)"
      : n.snr > 2
      ? "var(--fg)"
      : n.snr > -3
      ? "var(--amber)"
      : "var(--cyan-dim)";
    const battCol = (n.batt ?? 0) > 40 ? "var(--fg)" : "var(--amber)";
    const seen = (n.lastActivity ?? n.lastHeard) != null
      ? fmtAgo(now - (n.lastActivity ?? n.lastHeard))
      : "—";
    const row = h(
      "div",
      { class: "rs-row", style: { top: `${index * ROW_H}px`, gridTemplateColumns: GRID } },
      h("span", { class: "rs-c mono rs-ell", style: { color: "var(--cyan-dim)" } }, n.id || "—"),
      h(
        "span",
        { class: "rs-c rs-name" },
        h("span", {
          class: "rs-dot",
          style: {
            background: n.online ? color : "var(--fg-dim)",
            boxShadow: n.online ? `0 0 5px ${color}` : "none",
          },
        }),
        h("span", { class: "mono rs-ell" }, n.long || ""),
      ),
      h("span", { class: "rs-c mono rs-ell", style: { color: "var(--cyan-dim)" } }, n.hw || ""),
      h("span", { class: "rs-c mono rs-ell", style: { color: "var(--fg-dim)" } }, n.role || ""),
      h("span", { class: "rs-c mono", style: { color } }, (n.proto && n.proto.tag) || ""),
      h(
        "span",
        { class: "rs-c mono", style: { color: snrCol } },
        n.snr == null ? "—" : `${n.snr > 0 ? "+" : ""}${n.snr}`,
      ),
      h(
        "span",
        { class: "rs-c rs-bat" },
        h(
          "span",
          { class: "rs-bat-track" },
          h("span", {
            class: "rs-bat-fill",
            style: { width: `${n.batt ?? 0}%`, background: battCol },
          }),
        ),
        h("span", { class: "mono", style: { color: battCol } }, n.batt == null ? "—" : n.batt),
      ),
      h("span", { class: "rs-c mono", style: { color: "var(--fg-dim)" } }, seen),
    );
    row.addEventListener("click", () => onFocus && onFocus(n));
    return row;
  }

  function rows() {
    return filterSortNodes(nodes, { q, sortKey, sortDir, active });
  }

  function renderRows() {
    const arr = rows();
    inner.style.height = `${arr.length * ROW_H}px`;
    const viewH = body.clientHeight || 220;
    const visible = Math.ceil(viewH / ROW_H) + 8;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4);
    inner.replaceChildren(...arr.slice(start, start + visible).map((n, i) => rowEl(n, start + i)));
  }

  function render() {
    count.textContent = `${fmtCount(rows().length)} / ${fmtCount(nodes.length)}`;
    sortLabel.textContent = `sort: ${sortKey} ${
      sortDir > 0 ? "asc" : "desc"
    }  ·  click row → locate`;
    renderRows();
  }

  function update(state, activeFilter) {
    nodes = state.nodes || [];
    active = activeFilter;
    render();
  }
  function setActive(activeFilter) {
    active = activeFilter;
    render();
  }

  renderHead();
  globalThis.addEventListener("resize", renderRows);
  globalThis.requestAnimationFrame(() => renderRows());
  return { el, update, setActive };
}
