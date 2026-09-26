import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base64ByteLength } from "./base64";
import {
  isNearDuplicateQuery,
  joinTranscript,
  nearestPcmSampleRate,
  normalizeQuery,
  pcmDurationMs,
  releasePadMs,
  silencePcm16Base64,
  LOCAL_SILENCE_MS,
  SCRIBE_MIN_AUDIO_MS,
} from "./stt-timing";

describe("nearestPcmSampleRate", () => {
  it("maps common AudioContext rates exactly", () => {
    assert.equal(nearestPcmSampleRate(16_000), 16_000);
    assert.equal(nearestPcmSampleRate(44_100), 44_100);
    assert.equal(nearestPcmSampleRate(48_000), 48_000);
  });

  it("picks the closest supported rate", () => {
    assert.equal(nearestPcmSampleRate(32_000), 24_000);
    assert.equal(nearestPcmSampleRate(96_000), 48_000);
  });
});

describe("pcm duration and release padding", () => {
  it("computes duration from 16-bit mono byte length", () => {
    assert.equal(pcmDurationMs(32_000, 16_000), 1_000);
    assert.equal(pcmDurationMs(0, 48_000), 0);
  });

  it("pads at least 250ms, and up to 2s of total audio", () => {
    assert.equal(releasePadMs(3_000), LOCAL_SILENCE_MS);
    assert.equal(releasePadMs(0), SCRIBE_MIN_AUDIO_MS);
    assert.equal(releasePadMs(1_800), LOCAL_SILENCE_MS);
    assert.equal(releasePadMs(1_000), 1_000);
  });

  it("encodes silence as zeroed PCM16", () => {
    const encoded = silencePcm16Base64(16_000, 250);
    assert.equal(base64ByteLength(encoded), 16_000 * 2 * 0.25);
    const bytes = Buffer.from(encoded, "base64");
    assert.ok(bytes.every((value) => value === 0));
  });
});

describe("transcript joining", () => {
  it("joins committed segments and a live partial", () => {
    assert.equal(joinTranscript(["weather in", "Berlin"], "tomorrow"), "weather in Berlin tomorrow");
    assert.equal(normalizeQuery("  cats   near me "), "cats near me");
  });

  it("treats punctuation-only differences as near-duplicates", () => {
    assert.equal(isNearDuplicateQuery("Cats near me", "cats near me."), true);
    assert.equal(isNearDuplicateQuery("cats", "cats near me"), false);
    assert.equal(isNearDuplicateQuery("", "cats"), false);
  });
});
