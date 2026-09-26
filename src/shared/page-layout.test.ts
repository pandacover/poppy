import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAGEBAR_HEIGHT, TITLEBAR_HEIGHT, pageViewBounds, pageViewIsLaidOut } from "./page-layout";

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
