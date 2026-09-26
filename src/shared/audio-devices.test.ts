import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audioInputSituation,
  audioTrackConstraints,
  isLikelyLoopbackLabel,
  pickAudioInputId,
} from "./audio-devices";

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

  it("flags when the only inputs are monitor/loopback devices", () => {
    const situation = audioInputSituation([
      { kind: "audioinput", deviceId: "default", label: "Default" },
      { kind: "audioinput", deviceId: "mon", label: "Monitor of Built-in Audio Analog Stereo" },
      { kind: "audiooutput", deviceId: "speakers", label: "Speakers" },
    ]);
    assert.equal(situation.onlyLoopback, true);
    assert.equal(situation.usableCount, 1);
    assert.ok(situation.pickedId);
  });

  it("does not treat a real mic as loopback-only", () => {
    const situation = audioInputSituation([
      { kind: "audioinput", deviceId: "mic-1", label: "USB Audio Device" },
    ]);
    assert.equal(situation.onlyLoopback, false);
    assert.equal(situation.usableCount, 1);
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
