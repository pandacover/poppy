import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GLASS_BORDER,
  GLASS_PAD,
  GLASS_RADIUS,
  LAUNCHER_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_MIN_WIDTH,
  LAUNCHER_RESULTS_HEIGHT,
  LAUNCHER_WIDTH,
  PAGEBAR_HEIGHT,
  PAGE_CHROME_GAP,
  PAGE_VIEW_BACKGROUND,
  PAGE_VIEW_RADIUS,
  PAGE_WINDOW_BACKGROUND,
  STAGE_PAD_X,
  STAGE_PAD_Y,
  clampLauncherFit,
  defaultLauncherSize,
  glassContentInset,
  isFiniteViewBounds,
  launcherWindowChrome,
  pageViewBounds,
  pageViewIsLaidOut,
  pointInViewBounds,
  sanitizeViewBounds,
} from "./page-layout";

describe("pageViewBounds", () => {
  it("sits in the glass inner slot below the Results chrome", () => {
    const bounds = pageViewBounds(980, 740);
    const inset = glassContentInset();
    assert.deepEqual(bounds, {
      x: inset.x,
      y: inset.y + PAGEBAR_HEIGHT + PAGE_CHROME_GAP,
      width: 980 - inset.x * 2,
      height: 740 - inset.y - (inset.y + PAGEBAR_HEIGHT + PAGE_CHROME_GAP),
    });
    assert.ok(bounds.x > STAGE_PAD_X);
    assert.ok(bounds.y > STAGE_PAD_Y + PAGEBAR_HEIGHT);
    assert.ok(bounds.x + bounds.width < 980 - STAGE_PAD_X);
    assert.ok(bounds.y + bounds.height < 740 - STAGE_PAD_Y);
  });

  it("does not produce a negative height on a short window", () => {
    const bounds = pageViewBounds(400, 50);
    assert.equal(bounds.height, 0);
    assert.equal(pageViewIsLaidOut(bounds), false);
  });

  it("is laid out once the page area has a positive size", () => {
    assert.equal(pageViewIsLaidOut(pageViewBounds(980, 740)), true);
    assert.equal(pageViewIsLaidOut({ width: 0, height: 400 }), false);
  });

  it("keeps the guest page inside the frosted frame, not full-bleed", () => {
    const bounds = pageViewBounds(980, 740);
    assert.ok(bounds.x >= Math.round(STAGE_PAD_X + GLASS_BORDER + GLASS_PAD) - 1);
    assert.ok(PAGE_VIEW_RADIUS < GLASS_RADIUS);
    assert.equal(PAGE_WINDOW_BACKGROUND, "#00000000");
    assert.equal(PAGE_VIEW_BACKGROUND, "#ffffff");
  });
});

describe("view bounds helpers", () => {
  it("rejects incomplete slot payloads from the renderer", () => {
    assert.equal(isFiniteViewBounds(null), false);
    assert.equal(isFiniteViewBounds({ x: 1, y: 2, width: 3 }), false);
    assert.equal(isFiniteViewBounds({ x: 1, y: 2, width: 3, height: Number.NaN }), false);
    assert.equal(isFiniteViewBounds({ x: 10.2, y: 20.8, width: 100, height: 200 }), true);
  });

  it("sanitizes slot rectangles to integer CSS pixels", () => {
    assert.deepEqual(sanitizeViewBounds({ x: 10.4, y: 20.6, width: 100.2, height: -4 }), {
      x: 10,
      y: 21,
      width: 100,
      height: 0,
    });
  });

  it("hit-tests guest coordinates against the laid-out slot", () => {
    const bounds = { x: 40, y: 80, width: 200, height: 100 };
    assert.equal(pointInViewBounds(40, 80, bounds), true);
    assert.equal(pointInViewBounds(239, 179, bounds), true);
    assert.equal(pointInViewBounds(240, 80, bounds), false);
    assert.equal(pointInViewBounds(40, 180, bounds), false);
  });
});

describe("launcher sizes", () => {
  it("uses a short idle window and a taller results window", () => {
    assert.equal(defaultLauncherSize(0).width, LAUNCHER_WIDTH);
    assert.equal(defaultLauncherSize(0).height, LAUNCHER_HEIGHT);
    assert.equal(defaultLauncherSize(5).height, LAUNCHER_RESULTS_HEIGHT);
    assert.ok(LAUNCHER_HEIGHT < LAUNCHER_RESULTS_HEIGHT);
    assert.ok(LAUNCHER_MIN_HEIGHT < LAUNCHER_HEIGHT);
  });

  it("clamps renderer-measured fits to the launcher min/max", () => {
    assert.deepEqual(clampLauncherFit({ width: 10, height: 10 }), {
      width: LAUNCHER_MIN_WIDTH,
      height: LAUNCHER_MIN_HEIGHT,
    });
    assert.equal(clampLauncherFit({ width: 4000, height: 4000 }).width, 920);
    assert.equal(clampLauncherFit({ width: 4000, height: 4000 }).height, 900);
  });
});

describe("launcherWindowChrome", () => {
  it("keeps a transparent frameless surface on every platform", () => {
    for (const platform of ["linux", "darwin", "win32"] as const) {
      const chrome = launcherWindowChrome(platform);
      assert.equal(chrome.transparent, true);
      assert.equal(chrome.backgroundColor, "#00000000");
      assert.equal(chrome.hasShadow, false);
    }
  });

  it("does not frost the whole window with vibrancy or acrylic", () => {
    const mac = launcherWindowChrome("darwin");
    assert.equal(mac.roundedCorners, true);
    assert.equal(mac.vibrancy, undefined);
    assert.equal(mac.visualEffectState, undefined);
    assert.equal(mac.backgroundMaterial, undefined);

    const win = launcherWindowChrome("win32");
    assert.equal(win.backgroundMaterial, undefined);
    assert.equal(win.vibrancy, undefined);

    const linux = launcherWindowChrome("linux");
    assert.equal(linux.vibrancy, undefined);
    assert.equal(linux.backgroundMaterial, undefined);
  });
});
