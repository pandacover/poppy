import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAGEBAR_HEIGHT, TITLEBAR_HEIGHT, pageViewBounds } from "./page-layout";

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
  });
});
