import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAllowingTransientAbort, type TransientLoadHost } from "./page-navigate";

function abortError(): Error {
  return Object.assign(new Error("ERR_ABORTED (-3) loading 'https://example.com/'"), {
    errno: -3,
    code: "ERR_ABORTED",
  });
}

function realError(): Error {
  return Object.assign(new Error("ERR_NAME_NOT_RESOLVED (-105) loading 'https://nope.test/'"), {
    errno: -105,
    code: "ERR_NAME_NOT_RESOLVED",
  });
}

interface MockState {
  starts: number;
  settlements: number;
  delays: number[];
  stale: boolean;
  destroyed: boolean;
  loading: boolean;
  document: boolean;
}

function host(
  state: MockState,
  start: () => Promise<void>,
  waitForSettlement: () => Promise<void> = async () => {
    state.settlements += 1;
  },
): TransientLoadHost {
  return {
    start: async () => {
      state.starts += 1;
      await start();
    },
    isStale: () => state.stale,
    isDestroyed: () => state.destroyed,
    isLoading: () => state.loading,
    hasDocument: () => state.document,
    waitForSettlement,
    delay: async (ms: number) => {
      state.delays.push(ms);
    },
  };
}

describe("loadAllowingTransientAbort", () => {
  it("resolves when the first load succeeds", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: false,
      document: false,
    };
    await loadAllowingTransientAbort(host(state, async () => undefined));
    assert.equal(state.starts, 1);
    assert.equal(state.settlements, 0);
  });

  it("retries a cancelled first navigation when nothing is loading yet", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: false,
      document: false,
    };
    await loadAllowingTransientAbort(
      host(state, async () => {
        if (state.starts === 1) {
          throw abortError();
        }
      }),
    );
    assert.equal(state.starts, 2);
    assert.deepEqual(state.delays, [40]);
    assert.equal(state.settlements, 0);
  });

  it("waits for the replacement load instead of aborting it with a retry", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: true,
      document: false,
    };
    await loadAllowingTransientAbort(
      host(state, async () => {
        throw abortError();
      }),
    );
    assert.equal(state.starts, 1);
    assert.equal(state.settlements, 1);
  });

  it("treats an abort after an http document committed as success", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: false,
      document: true,
    };
    await loadAllowingTransientAbort(
      host(state, async () => {
        throw abortError();
      }),
    );
    assert.equal(state.starts, 1);
    assert.equal(state.settlements, 1);
  });

  it("does not retry a real DNS/network failure", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: false,
      document: false,
    };
    await assert.rejects(
      () =>
        loadAllowingTransientAbort(
          host(state, async () => {
            throw realError();
          }),
        ),
      /ERR_NAME_NOT_RESOLVED/,
    );
    assert.equal(state.starts, 1);
    assert.equal(state.delays.length, 0);
  });

  it("returns without throwing when the view is closed mid-abort", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: false,
      document: false,
    };
    await loadAllowingTransientAbort(
      host(state, async () => {
        state.stale = true;
        throw abortError();
      }),
    );
    assert.equal(state.starts, 1);
    assert.equal(state.settlements, 0);
  });

  it("throws the abort if retries never start a load", async () => {
    const state: MockState = {
      starts: 0,
      settlements: 0,
      delays: [],
      stale: false,
      destroyed: false,
      loading: false,
      document: false,
    };
    await assert.rejects(
      () =>
        loadAllowingTransientAbort(
          host(state, async () => {
            throw abortError();
          }),
          { maxAttempts: 2 },
        ),
      /ERR_ABORTED/,
    );
    assert.equal(state.starts, 2);
  });
});
