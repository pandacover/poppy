export const LAUNCHER_WIDTH = 440;
export const LAUNCHER_HEIGHT = 580;
export const LAUNCHER_MIN_WIDTH = 380;
export const LAUNCHER_MIN_HEIGHT = 320;

export const PAGE_WINDOW_WIDTH = 980;
export const PAGE_WINDOW_HEIGHT = 740;
export const PAGE_MIN_WIDTH = 640;
export const PAGE_MIN_HEIGHT = 480;

/** Matches `.titlebar` height in styles.css (frameless window chrome). */
export const TITLEBAR_HEIGHT = 44;
/** Matches `.pagebar` height in styles.css. */
export const PAGEBAR_HEIGHT = 40;

export interface ViewBounds {
  x: number;
  y: number;
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
