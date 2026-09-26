function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function floatToPcm16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

/** 16-bit little-endian mono PCM (no container). */
export function encodePcm16(samples: ArrayLike<number>): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0, offset = 0; i < samples.length; i += 1, offset += 2) {
    view.setInt16(offset, floatToPcm16(samples[i] ?? 0), true);
  }
  return buffer;
}

/** Concatenate PCM chunks without flattening via spread (avoids call-stack limits). */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.length;
  }
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function mixDownToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  if (channels.length === 1) {
    const only = channels[0];
    return only ? new Float32Array(only) : new Float32Array(0);
  }
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(length);
  const count = channels.length;
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (let c = 0; c < count; c += 1) {
      sum += channels[c]?.[i] ?? 0;
    }
    out[i] = sum / count;
  }
  return out;
}

export function peakAmplitude(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i] ?? 0);
    if (value > peak) {
      peak = value;
    }
  }
  return peak;
}

export function rmsAmplitude(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] ?? 0;
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / samples.length);
}

/** 16-bit mono PCM WAV. Kept for tests and any fallback that still needs a container. */
export function encodePcm16Wav(samples: ArrayLike<number>, sampleRate: number): ArrayBuffer {
  const rate = Math.max(1, Math.round(sampleRate));
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    view.setInt16(offset, floatToPcm16(samples[i] ?? 0), true);
  }
  return buffer;
}

export interface WavHeader {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
}

export function readWavHeader(buffer: ArrayBuffer): WavHeader {
  if (buffer.byteLength < 44) {
    throw new Error("WAV buffer is too small to contain a header.");
  }
  const view = new DataView(buffer);
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file.");
  }
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataBytes: view.getUint32(40, true),
  };
}
