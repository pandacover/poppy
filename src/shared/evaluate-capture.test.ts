import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTURE_ERROR, messageForCapturePayload } from "./capture-errors";
import { evaluateCapture, MIN_CAPTURE_SECONDS } from "./evaluate-capture";

describe("evaluateCapture", () => {
  it("rejects recordings shorter than the minimum window", () => {
    const result = evaluateCapture({
      sampleCount: 10,
      peak: 0.9,
      sampleRate: 16_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "empty");
      assert.equal(result.message, CAPTURE_ERROR.emptyAudio);
    }
  });

  it("rejects digital silence even when the buffer is long enough", () => {
    const sampleRate = 16_000;
    const result = evaluateCapture({
      sampleCount: Math.floor(sampleRate * MIN_CAPTURE_SECONDS) + 1,
      peak: 0,
      sampleRate,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "silent");
      assert.equal(result.message, CAPTURE_ERROR.silentMic);
    }
  });

  it("accepts a multi-second spoken clip", () => {
    const result = evaluateCapture({
      sampleCount: 16_000 * 5,
      peak: 0.4,
      sampleRate: 16_000,
    });
    assert.equal(result.ok, true);
  });
});

describe("messageForCapturePayload", () => {
  it("distinguishes empty audio from a silent mic", () => {
    assert.equal(messageForCapturePayload({ data: "", error: "empty" }), CAPTURE_ERROR.emptyAudio);
    assert.equal(messageForCapturePayload({ data: "", error: "silent" }), CAPTURE_ERROR.silentMic);
    assert.equal(messageForCapturePayload({ data: "" }), CAPTURE_ERROR.emptyAudio);
    assert.equal(messageForCapturePayload({ data: "   " }), CAPTURE_ERROR.emptyAudio);
    assert.equal(messageForCapturePayload({ data: "UklGRg==" }), null);
  });
});
