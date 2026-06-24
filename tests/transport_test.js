// SPDX-License-Identifier: Apache-2.0
import { assert, assertEquals } from "./assert.js";
import {
  createEventsTransport,
  createPollingTransport,
  startTransports,
} from "../static/js/transport.js";

function fakeScheduler() {
  const timers = new Map();
  let id = 0;
  return {
    setInterval: (fn) => {
      id++;
      timers.set(id, fn);
      return id;
    },
    clearInterval: (h) => timers.delete(h),
    fireAll: () => {
      for (const fn of timers.values()) fn();
    },
    count: () => timers.size,
  };
}

Deno.test("start ticks immediately and schedules the interval", async () => {
  let ticks = 0;
  const sched = fakeScheduler();
  const t = createPollingTransport({ intervalSec: 5, tick: () => ticks++, scheduler: sched });
  t.start();
  await Promise.resolve();
  assertEquals(ticks, 1); // immediate
  assert(t.running);
  assertEquals(sched.count(), 1);
  sched.fireAll();
  sched.fireAll();
  assertEquals(ticks, 3);
  t.stop();
  assert(!t.running);
  assertEquals(sched.count(), 0);
});

Deno.test("a throwing tick does not kill the transport", async () => {
  const sched = fakeScheduler();
  const t = createPollingTransport({
    intervalSec: 1,
    tick: () => {
      throw new Error("x");
    },
    scheduler: sched,
  });
  t.start();
  await Promise.resolve();
  assert(t.running); // survived the throw
  t.stop();
});

// ---- events (SSE) transport ----

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url) {
    this.url = url;
    this.readyState = FakeEventSource.CONNECTING;
    this.onopen = null;
    this.onerror = null;
    this.closed = false;
    this._listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  // --- test drivers ---
  open() {
    this.readyState = FakeEventSource.OPEN;
    if (this.onopen) this.onopen({});
  }
  raw(data) {
    for (const fn of this._listeners.get("change") || []) fn({ data });
  }
  change(collection) {
    this.raw(JSON.stringify({ collection }));
  }
  error(readyState) {
    this.readyState = readyState;
    if (this.onerror) this.onerror({});
  }
}

function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    setTimeout: (fn) => {
      id++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (h) => timers.delete(h),
    flush: () => {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
    count: () => timers.size,
  };
}

function makeEvents(overrides = {}) {
  let created = null;
  const timers = fakeTimers();
  const calls = { change: [], open: 0, degraded: 0, fatal: [] };
  const t = createEventsTransport({
    apiBase: "https://x.example",
    coalesceMs: 300,
    eventSourceFactory: (url) => {
      created = new FakeEventSource(url);
      return created;
    },
    scheduler: timers,
    onChange: (cols) => calls.change.push(cols),
    onOpen: () => calls.open++,
    onDegraded: () => calls.degraded++,
    onFatal: (info) => calls.fatal.push(info),
    ...overrides,
  });
  return { t, timers, calls, es: () => created };
}

Deno.test("events: opens, then coalesces a burst into one onChange", () => {
  const { t, timers, calls, es } = makeEvents();
  t.start();
  assert(t.running);
  assertEquals(es().url, "https://x.example/api/events");
  es().open();
  assertEquals(calls.open, 1);
  es().change("nodes");
  es().change("positions");
  es().change("nodes"); // duplicate inside the window
  assertEquals(calls.change.length, 0); // nothing emitted until the window closes
  assertEquals(timers.count(), 1); // exactly one coalesce timer
  timers.flush();
  assertEquals(calls.change.length, 1);
  assertEquals([...calls.change[0]].sort(), ["nodes", "positions"]);
  t.stop();
});

Deno.test("events: fatal error (CLOSED) stops and signals fall-back-to-polling", () => {
  const { t, calls, es } = makeEvents();
  t.start();
  es().error(FakeEventSource.CLOSED); // e.g. 404 / CORS — browser will not retry
  assertEquals(calls.fatal.length, 1);
  assert(!t.running);
  assert(es().closed);
});

Deno.test("events: transient error (CONNECTING) degrades but keeps running", () => {
  const { t, calls, es } = makeEvents();
  t.start();
  es().open();
  es().error(FakeEventSource.CONNECTING); // browser auto-reconnects
  assertEquals(calls.degraded, 1);
  assertEquals(calls.fatal.length, 0);
  assert(t.running);
  assert(!es().closed);
  t.stop();
});

Deno.test("events: stop() closes the stream and clears the coalesce timer", () => {
  const { t, timers, es } = makeEvents();
  t.start();
  es().change("nodes"); // arms a flush
  assertEquals(timers.count(), 1);
  t.stop();
  assert(!t.running);
  assert(es().closed);
  assertEquals(timers.count(), 0);
});

Deno.test("events: a garbled payload still flushes a '*' reconcile sentinel", () => {
  const { t, timers, calls, es } = makeEvents();
  t.start();
  es().raw("not json");
  assertEquals(timers.count(), 1);
  timers.flush();
  assertEquals(calls.change[0], ["*"]);
  t.stop();
});

// ---- transport selection (startTransports, D23/D26) ----

function fakeEvents() {
  const t = {
    cbs: null,
    started: 0,
    stopped: 0,
    apiBase: null,
    start() {
      this.started++;
    },
    stop() {
      this.stopped++;
    },
    fire(name, arg) {
      if (this.cbs && this.cbs[name]) this.cbs[name](arg);
    },
  };
  return {
    t,
    create: (opts) => {
      t.cbs = opts;
      t.apiBase = opts.apiBase;
      return t;
    },
  };
}

function fakePollers() {
  const made = [];
  return {
    made,
    create: (opts) => {
      const p = {
        opts,
        started: 0,
        stopped: 0,
        start() {
          this.started++;
        },
        stop() {
          this.stopped++;
        },
      };
      made.push(p);
      return p;
    },
  };
}

function fakeStore() {
  return {
    applied: [],
    refreshed: 0,
    applyChange(c) {
      this.applied.push(c);
    },
    refresh() {
      this.refreshed++;
    },
  };
}

Deno.test("startTransports: SSE opens → pubsub primary with a 5-min reconcile", () => {
  const store = fakeStore();
  const ev = fakeEvents();
  const poll = fakePollers();
  const tr = startTransports({
    store,
    apiBase: "https://x.example",
    intervalSec: 60,
    deps: {
      createEvents: ev.create,
      createPoller: poll.create,
      hasEventSource: true,
      scheduler: fakeTimers(),
    },
  });
  assertEquals(ev.t.started, 1); // stream opened optimistically
  assertEquals(ev.t.apiBase, "https://x.example");
  assertEquals(poll.made.length, 0); // no fast poll yet
  assertEquals(tr.mode, "polling"); // not opened yet

  ev.t.fire("onChange", ["nodes", "positions"]); // routes to the store before open
  assertEquals(store.applied, [["nodes", "positions"]]);

  ev.t.fire("onOpen");
  assertEquals(tr.mode, "pubsub");
  assertEquals(poll.made.length, 1); // the reconcile backstop
  assertEquals(poll.made[0].opts.intervalSec, 300);
  assertEquals(poll.made[0].started, 1);

  tr.stop();
  assertEquals(ev.t.stopped, 1);
});

Deno.test("startTransports: fatal error falls back to fast polling (AC-48)", () => {
  const ev = fakeEvents();
  const poll = fakePollers();
  const tr = startTransports({
    store: fakeStore(),
    apiBase: "https://x.example",
    intervalSec: 45,
    deps: {
      createEvents: ev.create,
      createPoller: poll.create,
      hasEventSource: true,
      scheduler: fakeTimers(),
    },
  });
  ev.t.fire("onFatal");
  assertEquals(poll.made.length, 1);
  assertEquals(poll.made[0].opts.intervalSec, 45); // fast poll at the server cadence
  assertEquals(tr.mode, "polling");
});

Deno.test("startTransports: no EventSource → straight to polling", () => {
  const ev = fakeEvents();
  const poll = fakePollers();
  startTransports({
    store: fakeStore(),
    apiBase: "https://x.example",
    intervalSec: 60,
    deps: {
      createEvents: ev.create,
      createPoller: poll.create,
      hasEventSource: false,
      scheduler: fakeTimers(),
    },
  });
  assertEquals(ev.t.started, 0); // never tried the stream
  assertEquals(poll.made.length, 1); // polling immediately
});

Deno.test("startTransports: slow connect arms a stopgap poll until open", () => {
  const ev = fakeEvents();
  const poll = fakePollers();
  const timers = fakeTimers();
  startTransports({
    store: fakeStore(),
    apiBase: "https://x.example",
    intervalSec: 60,
    deps: {
      createEvents: ev.create,
      createPoller: poll.create,
      hasEventSource: true,
      scheduler: timers,
    },
  });
  assertEquals(poll.made.length, 0); // nothing yet
  timers.flush(); // grace timer fires, still not opened
  assertEquals(poll.made.length, 1);
  assertEquals(poll.made[0].opts.intervalSec, 60); // fast stopgap poll
});
