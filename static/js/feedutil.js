// feedutil.js — pure helpers for the live feed (unit-tested).

/** Index nodes by id for sender lookup. */
export function nodesById(nodes = []) {
  const m = new Map();
  for (const n of nodes) if (n.id != null) m.set(n.id, n);
  return m;
}

/** Friendly sender label: node short name → long name → raw id. */
export function senderLabel(msg = {}, byId = new Map()) {
  const id = msg.fromId ?? msg.nodeId;
  const node = id != null ? byId.get(id) : null;
  if (node && node.short) return node.short;
  if (node && node.long) return node.long;
  return id || "?";
}

/** Whether a message passes the active protocol filter (unknown protocols pass). */
export function protoEnabled(msg = {}, active = null) {
  if (!active) return true;
  const key = msg.proto && msg.proto.key;
  return active[key] !== false;
}
