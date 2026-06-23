import { assert, assertEquals } from "./assert.js";
import { createPollingTransport } from "../static/js/transport.js";

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
