export const LAUNCHER_WIDTH = 760;
export const LAUNCHER_HEIGHT = 168;
export const LAUNCHER_RESULTS_HEIGHT = 720;
export const LAUNCHER_MIN_WIDTH = 560;
export const LAUNCHER_MIN_HEIGHT = 132;

export const PAGE_WINDOW_WIDTH = 980;
export const PAGE_WINDOW_HEIGHT = 740;
export const PAGE_MIN_WIDTH = 640;
export const PAGE_MIN_HEIGHT = 480;

/** Matches `.titlebar` height in styles.css (frameless window chrome). */
export const TITLEBAR_HEIGHT = 44;
/** Matches `.pagebar` height in styles.css. */
export const PAGEBAR_HEIGHT = 40;

export const LAUNCHER_BACKGROUND = "#00000000";
export const PAGE_CHROME_BACKGROUND = "#eef0f5";

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LauncherFitSize {
  width: number;
  height: number;
}

/** Place the in-app page view below the title bar and page toolbar. */
export function pageViewBounds(contentWidth: number, contentHeight: number): ViewBounds {
  const y = TITLEBAR_HEIGHT + PAGEBAR_HEIGHT;
  return {
    x: 0,
    y,
    width: Math.max(0, Math.floor(contentWidth)),
    height: Math.max(0, Math.floor(contentHeight) - y),
  };
}

/** Chromium may abort the first load if the view is still 0×0 after window expand. */
export function pageViewIsLaidOut(bounds: Pick<ViewBounds, "width" | "height">): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

export function clampLauncherFit(size: LauncherFitSize): LauncherFitSize {
  return {
    width: Math.min(920, Math.max(LAUNCHER_MIN_WIDTH, Math.round(size.width))),
    height: Math.min(900, Math.max(LAUNCHER_MIN_HEIGHT, Math.round(size.height))),
  };
}

export function defaultLauncherSize(resultCount: number): LauncherFitSize {
  return {
    width: LAUNCHER_WIDTH,
    height: resultCount > 0 ? LAUNCHER_RESULTS_HEIGHT : LAUNCHER_HEIGHT,
  };
}

/** Frameless glass window chrome. Vibrancy/acrylic are OS-specific and optional. */
export function launcherWindowChrome(platform: NodeJS.Platform): Record<string, string | boolean> {
  const chrome: Record<string, string | boolean> = {
    transparent: true,
    backgroundColor: LAUNCHER_BACKGROUND,
    hasShadow: false,
  };
  if (platform === "darwin") {
    chrome.vibrancy = "under-window";
    chrome.visualEffectState = "active";
    chrome.roundedCorners = true;
  }
  if (platform === "win32") {
    chrome.backgroundMaterial = "acrylic";
  }
  return chrome;
}
