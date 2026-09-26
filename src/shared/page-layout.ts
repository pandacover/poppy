export const LAUNCHER_WIDTH = 760;
export const LAUNCHER_HEIGHT = 168;
export const LAUNCHER_RESULTS_HEIGHT = 720;
export const LAUNCHER_MIN_WIDTH = 560;
export const LAUNCHER_MIN_HEIGHT = 132;

export const PAGE_WINDOW_WIDTH = 980;
export const PAGE_WINDOW_HEIGHT = 740;
export const PAGE_MIN_WIDTH = 640;
export const PAGE_MIN_HEIGHT = 480;

/** Matches `.stage` padding in styles.css. */
export const STAGE_PAD_X = 24;
export const STAGE_PAD_Y = 20;
/** Matches `.glass` padding. */
export const GLASS_PAD = 12;
/** Matches `.glass` border width. */
export const GLASS_BORDER = 1.5;
/** Matches `.glass` border-radius. */
export const GLASS_RADIUS = 28;
/** Matches `.pagebar` height inside the page glass. */
export const PAGEBAR_HEIGHT = 40;
/** Gap between the page chrome row and the page slot (`.page-frame` gap). */
export const PAGE_CHROME_GAP = 8;
/** Inner clip radius for the WebContentsView (glass radius minus inset). */
export const PAGE_VIEW_RADIUS = 16;

export const LAUNCHER_BACKGROUND = "#00000000";
/** Page chrome stays on the transparent window; frost lives on the glass frame. */
export const PAGE_WINDOW_BACKGROUND = LAUNCHER_BACKGROUND;
/** Guest pages are opaque so hit-testing does not fall through the view. */
export const PAGE_VIEW_BACKGROUND = "#ffffff";

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

export function glassContentInset(): { x: number; y: number } {
  return {
    x: Math.round(STAGE_PAD_X + GLASS_BORDER + GLASS_PAD),
    y: Math.round(STAGE_PAD_Y + GLASS_BORDER + GLASS_PAD),
  };
}

/**
 * Place the in-app page view in the glass inner slot: below the Results chrome,
 * inset so the frosted frame / bright border stay visible and are not a drag
 * overlay over the guest page.
 */
export function pageViewBounds(contentWidth: number, contentHeight: number): ViewBounds {
  const inset = glassContentInset();
  const y = inset.y + PAGEBAR_HEIGHT + PAGE_CHROME_GAP;
  return {
    x: Math.max(0, inset.x),
    y: Math.max(0, y),
    width: Math.max(0, Math.floor(contentWidth) - inset.x * 2),
    height: Math.max(0, Math.floor(contentHeight) - inset.y - y),
  };
}

export function isFiniteViewBounds(value: unknown): value is ViewBounds {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const candidate = value as ViewBounds;
  return (
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.width) &&
    Number.isFinite(candidate.height)
  );
}

export function sanitizeViewBounds(bounds: ViewBounds): ViewBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

/** Chromium may abort the first load if the view is still 0×0 after window expand. */
export function pageViewIsLaidOut(bounds: Pick<ViewBounds, "width" | "height">): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

export function pointInViewBounds(
  x: number,
  y: number,
  bounds: Pick<ViewBounds, "x" | "y" | "width" | "height">,
): boolean {
  return x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
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

/** Transparent frameless surface. Frost lives on the glass frame in CSS, not the window. */
export function launcherWindowChrome(platform: NodeJS.Platform): Record<string, string | boolean> {
  const chrome: Record<string, string | boolean> = {
    transparent: true,
    backgroundColor: LAUNCHER_BACKGROUND,
    hasShadow: false,
  };
  if (platform === "darwin") {
    chrome.roundedCorners = true;
  }
  return chrome;
}
