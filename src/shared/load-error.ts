/** Chromium/Electron: navigation cancelled (redirect, replaced URL, view not ready). */
export const ERR_ABORTED = -3;

function errorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error ?? "");
}

function errorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const err = error as { code?: unknown; errno?: unknown };
  if (typeof err.errno === "number" || typeof err.errno === "string") {
    return err.errno;
  }
  if (typeof err.code === "number" || typeof err.code === "string") {
    return err.code;
  }
  return undefined;
}

/** True for `did-fail-load` / `loadURL` abort codes that are not a final page failure. */
export function isTransientErrorCode(code: number): boolean {
  return code === ERR_ABORTED;
}

/**
 * `webContents.loadURL` rejects with ERR_ABORTED when Chromium cancels a
 * provisional load: replacing `about:blank` on a new WebContentsView, a
 * redirect, or a bounds change while the view is first attached.
 *
 * Those are not "the page failed" — the replacement navigation may still succeed.
 */
export function isTransientLoadError(error: unknown): boolean {
  const code = errorCode(error);
  if (code === ERR_ABORTED || code === "ERR_ABORTED") {
    return true;
  }
  const text = errorText(error);
  return text.includes("ERR_ABORTED") || /\(\s*-3\s*\)/.test(text);
}
