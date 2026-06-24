// SPDX-License-Identifier: Apache-2.0
// roster.js — pure roster filtering/sorting (unit-tested). Columns drive both the
// header and the sort. HOPS is intentionally absent (no node field — SPEC.md D16).
export const COLUMNS = [
  { key: "id", label: "ID", w: "92px", get: (n) => n.id },
  {
    key: "name",
    label: "NODE",
    w: "minmax(0,1.6fr)",
    get: (n) => String(n.long || "").toLowerCase(),
  },
  { key: "hw", label: "HW", w: "112px", get: (n) => n.hw },
  { key: "role", label: "ROLE", w: "108px", get: (n) => n.role },
  { key: "proto", label: "PROTO", w: "58px", get: (n) => n.proto && n.proto.tag },
  { key: "snr", label: "SNR", w: "58px", get: (n) => n.snr },
  { key: "batt", label: "BAT", w: "76px", get: (n) => n.batt },
  { key: "ago", label: "SEEN", w: "62px", get: (n) => n.lastActivity ?? n.lastHeard },
];

const COL = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

function matchesQuery(n, qq) {
  return (n.id && n.id.toLowerCase().includes(qq)) ||
    (n.long && String(n.long).toLowerCase().includes(qq)) ||
    (n.short && String(n.short).toLowerCase().includes(qq)) ||
    (n.hw && n.hw.toLowerCase().includes(qq)) ||
    (n.role && n.role.toLowerCase().includes(qq));
}

/** Filter by search + active protocols, then sort by a column. Pure. */
export function filterSortNodes(
  nodes = [],
  { q = "", sortKey = "ago", sortDir = 1, active = null } = {},
) {
  const qq = q.trim().toLowerCase();
  const arr = nodes.filter((n) => {
    if (active && n.proto && active[n.proto.key] === false) return false;
    return qq ? matchesQuery(n, qq) : true;
  });
  const get = (COL[sortKey] || COL.ago).get;
  return arr.slice().sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1; // nulls always last
    if (y == null) return -1;
    if (x < y) return -sortDir;
    if (x > y) return sortDir;
    return 0;
  });
}
