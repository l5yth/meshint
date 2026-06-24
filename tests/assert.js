// SPDX-License-Identifier: Apache-2.0
// Minimal zero-dependency assertions — keeps `deno test` fully offline (no node:assert).
export function assertEquals(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || `assertEquals failed:\n  actual:   ${a}\n  expected: ${e}`);
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export async function assertRejects(fn, msg) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(msg || "expected promise to reject");
}
