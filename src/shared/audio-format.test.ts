import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAudioFormat } from "./audio-format";

describe("normalizeAudioFormat", () => {
  it("strips MIME prefixes and codec parameters", () => {
    assert.equal(normalizeAudioFormat("audio/webm;codecs=opus"), "webm");
    assert.equal(normalizeAudioFormat("audio/wav"), "wav");
    assert.equal(normalizeAudioFormat("audio/x-wav"), "wav");
    assert.equal(normalizeAudioFormat("wave"), "wav");
  });

  it("maps common aliases OpenRouter accepts", () => {
    assert.equal(normalizeAudioFormat("audio/mpeg"), "mp3");
    assert.equal(normalizeAudioFormat("mp3"), "mp3");
    assert.equal(normalizeAudioFormat("audio/mp4"), "m4a");
    assert.equal(normalizeAudioFormat("audio/ogg;codecs=opus"), "ogg");
    assert.equal(normalizeAudioFormat("flac"), "flac");
  });

  it("defaults empty input to wav", () => {
    assert.equal(normalizeAudioFormat(""), "wav");
    assert.equal(normalizeAudioFormat("   "), "wav");
  });
});
