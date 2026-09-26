import { BrowserWindow, session, WebContentsView } from "electron";
import {
  LAUNCHER_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_MIN_WIDTH,
  LAUNCHER_WIDTH,
  PAGE_MIN_HEIGHT,
  PAGE_MIN_WIDTH,
  PAGE_WINDOW_HEIGHT,
  PAGE_WINDOW_WIDTH,
  pageViewBounds,
} from "../shared/page-layout";
import { isSafeHttpUrl } from "../shared/safe-url";

const PAGE_PARTITION = "persist:poppy-page";

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
      if (!isMainFrame || code === -3) {
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

  function ensureView(win: BrowserWindow): WebContentsView {
    const existing = activeView();
    if (existing) {
      return existing;
    }

    wasAlwaysOnTop = win.isAlwaysOnTop();
    const bounds = win.getBounds();
    launcherSize = { width: bounds.width, height: bounds.height };

    win.setAlwaysOnTop(false);
    win.setMinimumSize(PAGE_MIN_WIDTH, PAGE_MIN_HEIGHT);
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: PAGE_WINDOW_WIDTH,
      height: PAGE_WINDOW_HEIGHT,
    });

    const next = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: pageSession(),
      },
    });
    next.setBackgroundColor("#161411");
    attachGuards(next.webContents);
    win.contentView.addChildView(next);
    attachResize(win);
    view = next;
    layout();
    return next;
  }

  function close(): void {
    generation += 1;
    const win = getWindow();
    const current = view;
    view = null;
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
    const current = ensureView(win);
    win.show();
    win.focus();
    layout();
    await current.webContents.loadURL(url);
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
