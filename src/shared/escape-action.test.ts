import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeAction } from "./escape-action";
import type { AppPhase } from "./types";

describe("escapeAction", () => {
  it("returns to results from an in-app page or opening load", () => {
    assert.equal(escapeAction("page"), "back-to-results");
    assert.equal(escapeAction("opening"), "back-to-results");
  });

  it("minimizes from idle, results, and other launcher phases", () => {
    const phases: AppPhase[] = [
      "idle",
      "results",
      "listening",
      "transcribing",
      "searching",
      "error",
    ];
    for (const phase of phases) {
      assert.equal(escapeAction(phase), "minimize", phase);
    }
  });

  it("minimizes when phase is unknown", () => {
    assert.equal(escapeAction(null), "minimize");
    assert.equal(escapeAction(undefined), "minimize");
  });
});
