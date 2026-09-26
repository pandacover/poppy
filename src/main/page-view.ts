import { BrowserWindow, session, WebContentsView } from "electron";
import { isTransientErrorCode, isTransientLoadError } from "../shared/load-error";
import {
  LAUNCHER_BACKGROUND,
  LAUNCHER_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_MIN_WIDTH,
  LAUNCHER_WIDTH,
  PAGE_CHROME_BACKGROUND,
  PAGE_MIN_HEIGHT,
  PAGE_MIN_WIDTH,
  PAGE_WINDOW_HEIGHT,
  PAGE_WINDOW_WIDTH,
  pageViewBounds,
  pageViewIsLaidOut,
} from "../shared/page-layout";
import { loadAllowingTransientAbort } from "../shared/page-navigate";
import { isSafeHttpUrl } from "../shared/safe-url";

const PAGE_PARTITION = "persist:poppy-page";
const EXPAND_WAIT_MS = 250;
const INITIAL_READY_MS = 1_000;
const LOAD_TIMEOUT_MS = 25_000;

export interface PageViewCallbacks {
  onTitle: (title: string) => void;
  onNavigated: (url: string) => void;
  onFail: (message: string) => void;
  onCloseRequest: () => void;
}

export function createPageView(
  getWindow: () => BrowserWindow | null,
  callbacks: PageViewCallbacks,
) {
  let view: WebContentsView | null = null;
  let launcherSize: { width: number; height: number } | null = null;
  let wasAlwaysOnTop = true;
  let generation = 0;
  let resizeHandler: (() => void) | null = null;
  let needsInitialReady = false;

  function activeView(): WebContentsView | null {
    if (view && !view.webContents.isDestroyed()) {
      return view;
    }
    return null;
  }

  function layout(): void {
    const win = getWindow();
    const current = activeView();
    if (!win || win.isDestroyed() || !current) {
      return;
    }
    const [width, height] = win.getContentSize();
    current.setBounds(pageViewBounds(width, height));
  }

  function detachResize(win: BrowserWindow | null): void {
    if (win && !win.isDestroyed() && resizeHandler) {
      win.removeListener("resize", resizeHandler);
    }
    resizeHandler = null;
  }

  function attachResize(win: BrowserWindow): void {
    detachResize(win);
    resizeHandler = () => layout();
    win.on("resize", resizeHandler);
  }

  function pageSession() {
    const ses = session.fromPartition(PAGE_PARTITION);
    ses.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    ses.setPermissionCheckHandler(() => false);
    return ses;
  }

  function attachGuards(contents: Electron.WebContents): void {
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeHttpUrl(url) && !contents.isDestroyed()) {
        void contents.loadURL(url);
      }
      return { action: "deny" };
    });

    const blockUnsafe = (event: Electron.Event, url: string) => {
      if (!isSafeHttpUrl(url)) {
        event.preventDefault();
      }
    };
    contents.on("will-navigate", blockUnsafe);
    contents.on("will-redirect", blockUnsafe);

    contents.on("page-title-updated", (_event, title) => {
      callbacks.onTitle(title);
    });
    contents.on("did-navigate", (_event, url) => {
      callbacks.onNavigated(url);
    });
    contents.on("did-navigate-in-page", (_event, url) => {
      callbacks.onNavigated(url);
    });
    contents.on("did-fail-load", (_event, code, description, _failedUrl, isMainFrame) => {
      if (!isMainFrame || isTransientErrorCode(code)) {
        return;
      }
      callbacks.onFail(`Could not load that page (${description}).`);
    });
    contents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        callbacks.onCloseRequest();
      }
    });
  }

  function waitForExpand(win: BrowserWindow): Promise<void> {
    const [beforeW, beforeH] = win.getContentSize();
    if (beforeW >= PAGE_WINDOW_WIDTH - 40 && beforeH >= PAGE_WINDOW_HEIGHT - 40) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        win.removeListener("resize", onResize);
        resolve();
      };
      const onResize = () => {
        const [width, height] = win.getContentSize();
        if (width > beforeW || height > beforeH) {
          finish();
        }
      };
      const timer = setTimeout(finish, EXPAND_WAIT_MS);
      win.on("resize", onResize);
    });
  }

  function waitUntilLaidOut(current: WebContentsView): Promise<void> {
    layout();
    if (pageViewIsLaidOut(current.getBounds())) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        layout();
        resolve();
      }, 50);
    });
  }

  function waitForInitialReady(contents: Electron.WebContents): Promise<void> {
    if (!needsInitialReady || contents.isDestroyed()) {
      return Promise.resolve();
    }
    needsInitialReady = false;
    if (!contents.isLoadingMainFrame() && contents.getURL()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        contents.removeListener("dom-ready", finish);
        contents.removeListener("did-stop-loading", finish);
        resolve();
      };
      const timer = setTimeout(finish, INITIAL_READY_MS);
      contents.once("dom-ready", finish);
      contents.once("did-stop-loading", finish);
    });
  }

  function waitForLoad(contents: Electron.WebContents, token: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (token !== generation || contents.isDestroyed()) {
        resolve();
        return;
      }
      if (!contents.isLoadingMainFrame() && isSafeHttpUrl(contents.getURL())) {
        resolve();
        return;
      }

      const cleanup = () => {
        clearTimeout(timer);
        contents.removeListener("did-finish-load", onFinish);
        contents.removeListener("did-fail-load", onFail);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("That page took too long to load."));
      }, LOAD_TIMEOUT_MS);

      const onFinish = () => {
        if (!isSafeHttpUrl(contents.getURL())) {
          return;
        }
        cleanup();
        resolve();
      };

      const onFail = (
        _event: Electron.Event,
        code: number,
        description: string,
        _failedUrl: string,
        isMainFrame: boolean,
      ) => {
        if (!isMainFrame || isTransientErrorCode(code)) {
          return;
        }
        cleanup();
        reject(new Error(`Could not load that page (${description}).`));
      };

      contents.on("did-finish-load", onFinish);
      contents.on("did-fail-load", onFail);
    });
  }

  async function loadPage(contents: Electron.WebContents, url: string, token: number): Promise<void> {
    await loadAllowingTransientAbort({
      start: () => contents.loadURL(url),
      isStale: () => token !== generation,
      isDestroyed: () => contents.isDestroyed(),
      isLoading: () => !contents.isDestroyed() && contents.isLoadingMainFrame(),
      hasDocument: () => !contents.isDestroyed() && isSafeHttpUrl(contents.getURL()),
      waitForSettlement: () => waitForLoad(contents, token),
      delay: sleep,
    });
  }

  async function ensureView(win: BrowserWindow, token: number): Promise<WebContentsView | null> {
    const existing = activeView();
    if (existing) {
      return existing;
    }

    wasAlwaysOnTop = win.isAlwaysOnTop();
    const bounds = win.getBounds();
    launcherSize = { width: bounds.width, height: bounds.height };

    win.setAlwaysOnTop(false);
    win.setBackgroundColor(PAGE_CHROME_BACKGROUND);
    win.setMinimumSize(PAGE_MIN_WIDTH, PAGE_MIN_HEIGHT);
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: PAGE_WINDOW_WIDTH,
      height: PAGE_WINDOW_HEIGHT,
    });
    await waitForExpand(win);
    if (token !== generation || win.isDestroyed()) {
      return null;
    }

    const next = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: pageSession(),
      },
    });
    next.setBackgroundColor(PAGE_CHROME_BACKGROUND);
    attachGuards(next.webContents);
    win.contentView.addChildView(next);
    attachResize(win);
    view = next;
    needsInitialReady = true;
    layout();
    return next;
  }

  function close(): void {
    generation += 1;
    const win = getWindow();
    const current = view;
    view = null;
    needsInitialReady = false;
    detachResize(win);

    if (current && !current.webContents.isDestroyed()) {
      if (win && !win.isDestroyed()) {
        win.contentView.removeChildView(current);
      }
      current.webContents.close();
    }

    if (win && !win.isDestroyed()) {
      win.setMinimumSize(LAUNCHER_MIN_WIDTH, LAUNCHER_MIN_HEIGHT);
      const bounds = win.getBounds();
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: launcherSize?.width ?? LAUNCHER_WIDTH,
        height: launcherSize?.height ?? LAUNCHER_HEIGHT,
      });
      win.setAlwaysOnTop(wasAlwaysOnTop);
      win.setBackgroundColor(LAUNCHER_BACKGROUND);
      win.webContents.focus();
    }
    launcherSize = null;
  }

  async function show(url: string): Promise<void> {
    if (!isSafeHttpUrl(url)) {
      throw new Error("That result has an unsafe URL.");
    }
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      throw new Error("Poppy window is not available.");
    }

    const token = ++generation;
    const current = await ensureView(win, token);
    if (!current || token !== generation || !activeView()) {
      return;
    }
    win.show();
    win.focus();
    layout();
    await waitUntilLaidOut(current);
    await waitForInitialReady(current.webContents);
    if (token !== generation || current.webContents.isDestroyed() || !activeView()) {
      return;
    }
    try {
      await loadPage(current.webContents, url, token);
    } catch (error) {
      if (token !== generation || !activeView()) {
        return;
      }
      if (isTransientLoadError(error)) {
        console.info("[poppy:page]", "aborted first navigation; retry did not commit", url);
        throw new Error("Could not load that page.");
      }
      throw error instanceof Error ? error : new Error("Could not load that page.");
    }
    if (token !== generation || !activeView()) {
      return;
    }
    current.webContents.focus();
  }

  return {
    show,
    close,
    layout,
    isOpen: () => activeView() != null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
