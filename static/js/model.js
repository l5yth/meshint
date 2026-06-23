// model.js — protocol metadata + pure normalizers (raw potato-mesh JSON → internal
// shapes). SPEC.md §6, D10. Tolerant of missing optional fields (AC-33).

export const PROTOCOLS = {
  meshtastic: { key: "meshtastic", tag: "MT", color: "#41ff8a" },
  meshcore: { key: "meshcore", tag: "MC", color: "#6fe6ff" },
  reticulum: { key: "reticulum", tag: "RNS", color: "#ffb24a" },
};
export const PROTOCOL_KEYS = ["meshtastic", "meshcore", "reticulum"];

/** Resolve a protocol string to its metadata; unknown protocols get a neutral entry. */
export function protocolOf(raw) {
  const k = String(raw || "").toLowerCase();
  return PROTOCOLS[k] ||
    { key: k || "unknown", tag: (k || "?").slice(0, 3).toUpperCase(), color: "#62b0c4" };
}

function num(v) {
  return (v === null || v === undefined || v === "") ? null : Number(v);
}

export function normalizeNode(raw = {}) {
  return {
    id: raw.node_id ?? null,
    short: raw.short_name ?? "",
    long: raw.long_name ?? raw.short_name ?? raw.node_id ?? "",
    hw: raw.hw_model ?? "",
    role: raw.role ?? "",
    proto: protocolOf(raw.protocol),
    snr: num(raw.snr),
    lastHeard: num(raw.last_heard),
    firstHeard: num(raw.first_heard),
    positionTime: num(raw.position_time),
    lat: num(raw.latitude),
    lon: num(raw.longitude),
    alt: num(raw.altitude),
    loraFreq: num(raw.lora_freq),
    modemPreset: raw.modem_preset ?? "",
    locationSource: raw.location_source ?? "",
    batt: num(raw.battery_level),
    volt: num(raw.voltage),
    chUtil: num(raw.channel_utilization),
    airTx: num(raw.air_util_tx),
    uptime: num(raw.uptime_seconds),
    lastSeenIso: raw.last_seen_iso ?? "",
  };
}

export function normalizeMessage(raw = {}) {
  return {
    id: raw.id ?? null,
    rxTime: num(raw.rx_time),
    rxIso: raw.rx_iso ?? "",
    fromId: raw.from_id ?? raw.node_id ?? null,
    toId: raw.to_id ?? null,
    nodeId: raw.node_id ?? raw.from_id ?? null,
    channel: num(raw.channel),
    channelName: raw.channel_name ?? "",
    portnum: raw.portnum ?? "",
    text: raw.text ?? "",
    snr: num(raw.snr),
    rssi: num(raw.rssi),
    hopLimit: num(raw.hop_limit),
    proto: protocolOf(raw.protocol),
    replyId: raw.reply_id ?? null,
    emoji: raw.emoji ?? null,
  };
}

export function normalizeTelemetry(raw = {}) {
  return {
    id: raw.id ?? null,
    nodeId: raw.node_id ?? raw.from_id ?? null,
    rxTime: num(raw.rx_time),
    type: raw.telemetry_type ?? "",
    proto: protocolOf(raw.protocol),
    batt: num(raw.battery_level),
    volt: num(raw.voltage),
    temperature: num(raw.temperature),
    humidity: num(raw.relative_humidity),
    chUtil: num(raw.channel_utilization),
    airTx: num(raw.air_util_tx),
    uptime: num(raw.uptime_seconds),
  };
}

export function normalizeInstance(raw = {}) {
  return {
    id: raw.id ?? null,
    domain: raw.domain ?? "",
    name: raw.name ?? raw.domain ?? "",
    version: raw.version ?? "",
    channel: raw.channel ?? "",
    frequency: raw.frequency ?? "",
    lat: num(raw.latitude),
    lon: num(raw.longitude),
    lastUpdate: num(raw.last_update),
    isPrivate: !!raw.is_private,
    nodes: num(raw.nodes_count) ?? 0,
    meshtastic: num(raw.meshtastic_nodes_count) ?? 0,
    meshcore: num(raw.meshcore_nodes_count) ?? 0,
    reticulum: num(raw.reticulum_nodes_count) ?? 0,
  };
}

/** Self-config from /version (SPEC.md D8). */
export function normalizeVersion(raw = {}) {
  const c = raw.config || {};
  const center = c.map_center || {};
  return {
    name: raw.name ?? c.site_name ?? "mesh",
    version: raw.version ?? "",
    lastNodeUpdate: num(raw.last_node_update),
    siteName: c.site_name ?? raw.name ?? "mesh",
    channel: c.channel ?? "",
    frequency: c.frequency ?? "",
    contactLink: c.contact_link ?? "",
    contactUrl: c.contact_link_url ?? "",
    refreshIntervalSec: num(c.refresh_interval_seconds) || 60,
    mapCenter: { lat: num(center.lat), lon: num(center.lon) },
    maxDistanceKm: num(c.max_distance_km),
    instanceDomain: c.instance_domain ?? "",
    privateMode: !!c.private_mode,
  };
}
