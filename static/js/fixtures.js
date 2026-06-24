// SPDX-License-Identifier: Apache-2.0
// fixtures.js — a fake api client backed by snapshot data. Same interface as
// createApiClient, for offline dev and deterministic tests (AC-18).
export function createFixtureClient(fixtures = {}) {
  const list = (x) => Array.isArray(x) ? x : [];
  return {
    apiBase: "fixture://local",
    version: () => Promise.resolve(fixtures.version || {}),
    nodes: () => Promise.resolve(list(fixtures.nodes)),
    messages: ({ since } = {}) =>
      Promise.resolve(
        list(fixtures.messages).filter((m) => since ? (m.rx_time ?? 0) > since : true),
      ),
    telemetry: () => Promise.resolve(list(fixtures.telemetry)),
    instances: () => Promise.resolve(list(fixtures.instances)),
  };
}
