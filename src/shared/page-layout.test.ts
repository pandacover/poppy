import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAUNCHER_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_MIN_WIDTH,
  LAUNCHER_RESULTS_HEIGHT,
  LAUNCHER_WIDTH,
  PAGEBAR_HEIGHT,
  TITLEBAR_HEIGHT,
  clampLauncherFit,
  defaultLauncherSize,
  launcherWindowChrome,
  pageViewBounds,
  pageViewIsLaidOut,
} from "./page-layout";

describe("pageViewBounds", () => {
  it("sits below the title bar and page toolbar", () => {
    const bounds = pageViewBounds(980, 740);
    assert.deepEqual(bounds, {
      x: 0,
      y: TITLEBAR_HEIGHT + PAGEBAR_HEIGHT,
      width: 980,
      height: 740 - TITLEBAR_HEIGHT - PAGEBAR_HEIGHT,
    });
  });

  it("does not produce a negative height on a short window", () => {
    const bounds = pageViewBounds(400, 50);
    assert.equal(bounds.height, 0);
    assert.equal(bounds.y, TITLEBAR_HEIGHT + PAGEBAR_HEIGHT);
    assert.equal(pageViewIsLaidOut(bounds), false);
  });

  it("is laid out once the page area has a positive size", () => {
    assert.equal(pageViewIsLaidOut(pageViewBounds(980, 740)), true);
    assert.equal(pageViewIsLaidOut({ width: 0, height: 400 }), false);
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

  it("enables vibrancy on macOS and acrylic on Windows", () => {
    const mac = launcherWindowChrome("darwin");
    assert.equal(mac.vibrancy, "under-window");
    assert.equal(mac.visualEffectState, "active");
    assert.equal(mac.roundedCorners, true);

    const win = launcherWindowChrome("win32");
    assert.equal(win.backgroundMaterial, "acrylic");
    assert.equal(win.vibrancy, undefined);

    const linux = launcherWindowChrome("linux");
    assert.equal(linux.vibrancy, undefined);
    assert.equal(linux.backgroundMaterial, undefined);
  });
});
