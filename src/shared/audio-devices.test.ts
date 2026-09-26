import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLikelyLoopbackLabel, pickAudioInputId, audioTrackConstraints } from "./audio-devices";

describe("isLikelyLoopbackLabel", () => {
  it("flags PulseAudio/PipeWire monitor sources", () => {
    assert.equal(isLikelyLoopbackLabel("Monitor of Built-in Audio Analog Stereo"), true);
    assert.equal(isLikelyLoopbackLabel("Stereo Mix (Realtek)"), true);
    assert.equal(isLikelyLoopbackLabel("USB Audio Device"), false);
    assert.equal(isLikelyLoopbackLabel("Built-in Audio Analog Stereo"), false);
  });
});

describe("pickAudioInputId", () => {
  it("skips monitor devices in favor of a real mic", () => {
    const id = pickAudioInputId([
      { kind: "audioinput", deviceId: "default", label: "Default" },
      { kind: "audioinput", deviceId: "mon", label: "Monitor of Built-in Audio Analog Stereo" },
      { kind: "audioinput", deviceId: "mic-1", label: "USB Audio Device" },
      { kind: "audiooutput", deviceId: "speakers", label: "Speakers" },
    ]);
    assert.equal(id, "mic-1");
  });

  it("falls back to default when nothing else is labelled", () => {
    const id = pickAudioInputId([
      { kind: "audioinput", deviceId: "default", label: "" },
    ]);
    assert.equal(id, "default");
  });
});

describe("audioTrackConstraints", () => {
  it("disables echo cancellation that can zero Linux capture", () => {
    const constraints = audioTrackConstraints("mic-1");
    assert.equal(constraints.echoCancellation, false);
    assert.equal(constraints.noiseSuppression, false);
    assert.deepEqual(constraints.deviceId, { ideal: "mic-1" });
  });

  it("omits deviceId for default/communications aliases", () => {
    assert.equal(audioTrackConstraints("default").deviceId, undefined);
  });
});
