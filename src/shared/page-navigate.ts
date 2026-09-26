import { isTransientLoadError } from "./load-error";

export interface TransientLoadHost {
  /** Start (or restart) navigation to the target URL. */
  start: () => Promise<void>;
  /** True when the user closed the view or started another open. */
  isStale: () => boolean;
  isDestroyed: () => boolean;
  /** Main-frame navigation still in flight. */
  isLoading: () => boolean;
  /** An http(s) document is already committed (abort was a replacement/redirect). */
  hasDocument: () => boolean;
  /** Wait for did-finish-load or a non-abort did-fail-load. */
  waitForSettlement: () => Promise<void>;
  delay: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Drive `loadURL` so a cancelled first navigation is retried or waited-out,
 * while real load failures still reject.
 */
export async function loadAllowingTransientAbort(
  host: TransientLoadHost,
  options?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (host.isStale() || host.isDestroyed()) {
      return;
    }
    try {
      await host.start();
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientLoadError(error)) {
        throw error;
      }
      if (host.isStale() || host.isDestroyed()) {
        return;
      }
      if (host.isLoading() || host.hasDocument()) {
        await host.waitForSettlement();
        return;
      }
      if (attempt === maxAttempts - 1) {
        await host.delay(50);
        if (host.isStale() || host.isDestroyed()) {
          return;
        }
        if (host.isLoading() || host.hasDocument()) {
          await host.waitForSettlement();
          return;
        }
        throw error;
      }
      await host.delay(40 * (attempt + 1));
    }
  }

  throw lastError;
}
