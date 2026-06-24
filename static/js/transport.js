// SPDX-License-Identifier: Apache-2.0
// transport.js — pluggable update transport. SPEC.md D9 / AC-37.
// The store depends only on this { start, stop, running } contract, so a future
// SSE or WebSocket transport can replace polling without touching the store or UI.

/**
 * @param {object}   opts
 * @param {number}   opts.intervalSec  seconds between ticks
 * @param {Function} opts.tick         async fn run once immediately, then each interval
 * @param {object}   [opts.scheduler]  { setInterval, clearInterval } — injected for tests
 */
export function createPollingTransport({ intervalSec = 60, tick, scheduler } = {}) {
  const sched = scheduler || {
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (h) => globalThis.clearInterval(h),
  };
  let handle = null;
  let running = false;

  async function runOnce() {
    // tick owns its error handling (degraded state); never let a rejection
    // kill the interval loop.
    try {
      await tick();
    } catch {
      // swallowed by design
    }
  }

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      runOnce();
      handle = sched.setInterval(runOnce, Math.max(1, intervalSec) * 1000);
    },
    stop() {
      running = false;
      if (handle != null) sched.clearInterval(handle);
      handle = null;
    },
  };
}
