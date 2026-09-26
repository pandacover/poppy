import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  concatFloat32,
  encodePcm16Wav,
  mixDownToMono,
  peakAmplitude,
  readWavHeader,
} from "./wav";
import { arrayBufferToBase64, base64ByteLength } from "./base64";

describe("encodePcm16Wav", () => {
  it("writes a valid 16-bit mono RIFF header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buffer = encodePcm16Wav(samples, 16_000);
    const header = readWavHeader(buffer);
    assert.equal(header.channels, 1);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.bitsPerSample, 16);
    assert.equal(header.dataBytes, samples.length * 2);
    assert.equal(buffer.byteLength, 44 + samples.length * 2);
  });

  it("round-trips through base64 without changing byte length", () => {
    const buffer = encodePcm16Wav(new Float32Array(320), 16_000);
    const encoded = arrayBufferToBase64(buffer);
    assert.equal(base64ByteLength(encoded), buffer.byteLength);
    assert.equal(Buffer.from(encoded, "base64").byteLength, buffer.byteLength);
  });
});

describe("pcm helpers", () => {
  it("concatenates chunks in order", () => {
    const joined = concatFloat32([new Float32Array([1, 2]), new Float32Array([3])]);
    assert.deepEqual([...joined], [1, 2, 3]);
  });

  it("mixes stereo down to mono", () => {
    const mono = mixDownToMono([new Float32Array([1, 0]), new Float32Array([-1, 0.5])]);
    assert.equal(mono.length, 2);
    assert.equal(mono[0], 0);
    assert.equal(mono[1], 0.25);
  });

  it("reports peak amplitude", () => {
    assert.equal(peakAmplitude([0.1, -0.4, 0.2]), 0.4);
    assert.equal(peakAmplitude(new Float32Array(8)), 0);
  });
});
