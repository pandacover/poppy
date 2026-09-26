import { isNearDuplicateQuery, normalizeQuery, SEARCH_DEBOUNCE_MS } from "./stt-timing";

export interface DebounceTimers {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaultTimers: DebounceTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

/**
 * Debounce a settled search query. Rapid commits collapse to the latest text.
 * Near-duplicates of a query that already ran are dropped until `reset()`.
 */
export function createSearchDebouncer(waitMs = SEARCH_DEBOUNCE_MS, timers: DebounceTimers = defaultTimers) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSearched = "";
  let epoch = 0;

  function cancel(): void {
    if (timer != null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  }

  function reset(): void {
    cancel();
    lastSearched = "";
    epoch += 1;
  }

  function schedule(query: string, run: (query: string) => void): void {
    const text = normalizeQuery(query);
    if (!text) {
      return;
    }
    if (isNearDuplicateQuery(text, lastSearched)) {
      cancel();
      return;
    }
    cancel();
    const token = epoch;
    timer = timers.setTimeout(() => {
      timer = null;
      if (token !== epoch) {
        return;
      }
      if (isNearDuplicateQuery(text, lastSearched)) {
        return;
      }
      lastSearched = text;
      run(text);
    }, waitMs);
  }

  return {
    schedule,
    cancel,
    reset,
    searched: () => lastSearched,
  };
}
