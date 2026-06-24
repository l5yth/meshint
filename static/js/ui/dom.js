// SPDX-License-Identifier: Apache-2.0
// dom.js — minimal hyperscript DOM helper; our vanilla stand-in for createElement (D3).
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class" || k === "className") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k in el) {
        try {
          el[k] = v;
        } catch {
          el.setAttribute(k, v);
        }
      } else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Replace all children of `parent` with `nodes`. */
export function mount(parent, ...nodes) {
  if (!parent) return;
  parent.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
}
