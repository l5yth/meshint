// SPDX-License-Identifier: Apache-2.0
// transport.js — pluggable update transports. SPEC.md D9/D23–D26 / AC-37/AC-45.
// Every transport exposes the same { start, stop, running } contract, so the store/UI
// never know whether updates arrive by polling (the fallback) or by the SSE event stream
// (createEventsTransport). The events transport additionally reports *which* collections
// changed, so the store can refetch + diff just those.

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

/**
 * SSE transport over potato-mesh `/api/events` (SPEC.md D23–D26). The stream emits coarse
 * `event: change` notifications — `data:{"collection":"<name>"}` — telling us *which*
 * collection changed, not the row. This transport coalesces a burst of those into a single
 * `onChange(collections)` callback (~coalesceMs), so the store does one batched refetch. It
 * separates a *fatal* connect failure (readyState CLOSED — 404/CORS: pubsub absent, caller
 * falls back to polling) from a *transient* drop (the browser auto-reconnects; surfaced as
 * degraded). EventSource is injected as a factory so this is unit-testable with no network.
 *
 * @param {object}   opts
 * @param {string}   opts.apiBase              API origin; the stream is `${apiBase}${path}`
 * @param {string}   [opts.path]               stream path (default `/api/events`)
 * @param {number}   [opts.coalesceMs]         burst-coalesce window in ms (default 300)
 * @param {Function} [opts.onChange]           (collections: string[]) => void, once per burst
 * @param {Function} [opts.onOpen]             () => void — connection established (pubsub live)
 * @param {Function} [opts.onDegraded]         () => void — transient drop; auto-reconnecting
 * @param {Function} [opts.onFatal]            (info) => void — fatal; caller should poll instead
 * @param {Function} [opts.eventSourceFactory] (url) => EventSourceLike — injected for tests
 * @param {object}   [opts.scheduler]          { setTimeout, clearTimeout } — injected for tests
 */
export function createEventsTransport(
  {
    apiBase,
    path = "/api/events",
    coalesceMs = 300,
    onChange,
    onOpen,
    onDegraded,
    onFatal,
    eventSourceFactory,
    scheduler,
  } = {},
) {
  const makeES = eventSourceFactory || ((url) => new globalThis.EventSource(url));
  const sched = scheduler || {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h),
  };

  let es = null;
  let running = false;
  let opened = false;
  let flushHandle = null;
  const pending = new Set();

  function isClosed() {
    const ctor = es && es.constructor;
    const closed = ctor && Number.isInteger(ctor.CLOSED) ? ctor.CLOSED : 2;
    return !!es && es.readyState === closed;
  }

  function flush() {
    flushHandle = null;
    if (pending.size === 0) return;
    const cols = [...pending];
    pending.clear();
    if (onChange) onChange(cols);
  }

  function scheduleFlush() {
    // Fixed window: the first event of a burst arms the timer; later events in the same
    // window join `pending` without resetting it, so sustained traffic still flushes every
    // ~coalesceMs (which also bounds the downstream flash rate).
    if (flushHandle == null) flushHandle = sched.setTimeout(flush, Math.max(0, coalesceMs));
  }

  function handleChange(ev) {
    let col = null;
    try {
      col = JSON.parse(ev.data).collection;
    } catch {
      col = null;
    }
    pending.add(col || "*"); // "*" = unknown payload → caller does a light reconcile
    scheduleFlush();
  }

  function handleOpen() {
    opened = true;
    if (onOpen) onOpen();
  }

  function handleError() {
    // CLOSED ⇒ the browser gave up (bad status / CORS / wrong type) and will NOT retry:
    // pubsub is unavailable here, so the caller should fall back to polling. Otherwise the
    // browser is mid-reconnect (CONNECTING) — keep running and surface degraded.
    if (isClosed()) {
      stop();
      if (onFatal) onFatal({ everOpened: opened });
    } else if (onDegraded) {
      onDegraded();
    }
  }

  function start() {
    if (running) return;
    running = true;
    opened = false;
    es = makeES(String(apiBase || "").replace(/\/+$/, "") + path);
    es.onopen = handleOpen;
    es.onerror = handleError;
    es.addEventListener("change", handleChange);
  }

  function stop() {
    running = false;
    if (flushHandle != null) {
      sched.clearTimeout(flushHandle);
      flushHandle = null;
    }
    pending.clear();
    if (es) {
      try {
        es.onopen = null;
        es.onerror = null;
        es.removeEventListener("change", handleChange);
        es.close();
      } catch {
        // already closed / partial fake — nothing to clean up
      }
      es = null;
    }
  }

  return {
    get running() {
      return running;
    },
    start,
    stop,
  };
}

/**
 * Compose the live-update transports (SPEC.md D23/D26). Pubsub-primary: open the SSE stream
 * and, once connected, make it the sole live source — the fast poll is dropped and a slow
 * 5-min reconcile poll backstops missed events. A fatal connect error (no /api/events here)
 * falls back to polling at the server cadence; a transient drop reconciles and self-heals.
 * `onChange` collections are routed to `store.applyChange`. Dependencies are injected so the
 * selection logic is unit-testable without a network, timers, or a browser.
 *
 * @param {object} opts
 * @param {object} opts.store        the meshint store ({ applyChange, refresh })
 * @param {string} opts.apiBase      API origin for the event stream
 * @param {number} [opts.intervalSec] fast-poll cadence used when pubsub is unavailable
 * @param {object} [opts.deps]       { createEvents, createPoller, hasEventSource, scheduler }
 * @returns {{ events, mode, poller, reconcile, stop }}
 */
export function startTransports({ store, apiBase, intervalSec = 60, deps = {} } = {}) {
  const createEvents = deps.createEvents || createEventsTransport;
  const createPoller = deps.createPoller || createPollingTransport;
  const hasEventSource = deps.hasEventSource ?? (typeof globalThis.EventSource === "function");
  const sched = deps.scheduler || {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h),
  };
  const RECONCILE_SEC = 300; // 5-min backstop while streaming (D23)
  const CONNECT_GRACE_MS = 6000; // poll as a stopgap if the stream is slow to open

  let poller = null;
  let reconcile = null;
  let connectTimer = null;
  let opened = false;

  function startPolling() {
    if (!poller) {
      poller = createPoller({ intervalSec, tick: () => store.refresh() });
      poller.start();
    }
  }
  function stopPolling() {
    if (poller) {
      poller.stop();
      poller = null;
    }
  }
  function startReconcile() {
    if (!reconcile) {
      reconcile = createPoller({ intervalSec: RECONCILE_SEC, tick: () => store.refresh() });
      reconcile.start();
    }
  }
  function clearConnectTimer() {
    if (connectTimer != null) {
      sched.clearTimeout(connectTimer);
      connectTimer = null;
    }
  }

  const events = createEvents({
    apiBase,
    onChange: (collections) => store.applyChange(collections),
    onOpen: () => {
      opened = true;
      clearConnectTimer();
      stopPolling(); // pubsub is primary now — drop the fast poll (AC-46)
      const firstOpen = !reconcile;
      startReconcile(); // 5-min backstop; its immediate tick resyncs on first open
      if (!firstOpen) store.refresh(); // reconnect → catch up on missed events (AC-49)
    },
    onDegraded: () => store.refresh(), // transient drop: reconcile / surface degraded (AC-49)
    onFatal: () => {
      clearConnectTimer();
      startPolling(); // no /api/events here — fall back to polling (AC-48)
    },
  });

  if (hasEventSource) {
    try {
      events.start();
      connectTimer = sched.setTimeout(() => {
        connectTimer = null;
        if (!opened) startPolling(); // slow connect — poll meanwhile; onOpen will stop it
      }, CONNECT_GRACE_MS);
    } catch {
      startPolling();
    }
  } else {
    startPolling(); // environment without EventSource
  }

  return {
    events,
    get mode() {
      return opened ? "pubsub" : "polling";
    },
    get poller() {
      return poller;
    },
    get reconcile() {
      return reconcile;
    },
    stop() {
      clearConnectTimer();
      events.stop();
      stopPolling();
      if (reconcile) {
        reconcile.stop();
        reconcile = null;
      }
    },
  };
}
