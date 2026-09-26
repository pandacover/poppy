import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSearchDebouncer, type DebounceTimers } from "./search-debounce";

function manualTimers(): { timers: DebounceTimers; flush: () => void } {
  let nextId = 0;
  const pending = new Map<number, () => void>();
  const timers: DebounceTimers = {
    setTimeout: (fn) => {
      const id = ++nextId;
      pending.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as unknown as number);
    },
  };
  return {
    timers,
    flush() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) {
        fn();
      }
    },
  };
}

describe("createSearchDebouncer", () => {
  it("runs only the latest query after rapid updates", () => {
    const { timers, flush } = manualTimers();
    const calls: string[] = [];
    const debouncer = createSearchDebouncer(250, timers);
    debouncer.schedule("cats", (query) => calls.push(query));
    debouncer.schedule("cats near me", (query) => calls.push(query));
    assert.deepEqual(calls, []);
    flush();
    assert.deepEqual(calls, ["cats near me"]);
  });

  it("does not re-search a near-duplicate of the last query", () => {
    const { timers, flush } = manualTimers();
    const calls: string[] = [];
    const debouncer = createSearchDebouncer(250, timers);
    debouncer.schedule("best espresso", (query) => calls.push(query));
    flush();
    debouncer.schedule("best espresso.", (query) => calls.push(query));
    flush();
    assert.deepEqual(calls, ["best espresso"]);
  });

  it("searches again after reset", () => {
    const { timers, flush } = manualTimers();
    const calls: string[] = [];
    const debouncer = createSearchDebouncer(250, timers);
    debouncer.schedule("one", (query) => calls.push(query));
    flush();
    debouncer.reset();
    debouncer.schedule("one", (query) => calls.push(query));
    flush();
    assert.deepEqual(calls, ["one", "one"]);
  });
});
