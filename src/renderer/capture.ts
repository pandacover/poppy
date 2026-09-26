import {
  audioTrackConstraints,
  isLikelyLoopbackLabel,
  pickAudioInputId,
} from "../shared/audio-devices";
import { arrayBufferToBase64 } from "../shared/base64";
import { evaluateCapture } from "../shared/evaluate-capture";
import type { AudioPayload } from "../shared/types";
import { concatFloat32, encodePcm16Wav, mixDownToMono, peakAmplitude } from "../shared/wav";

interface VoiceCaptureCallbacks {
  submitAudio: (payload: AudioPayload & { generation: number }) => Promise<void>;
  reportMicError: (message: string) => Promise<void>;
}

interface PcmSession {
  finish: () => Promise<{ samples: Float32Array; sampleRate: number }>;
}

/**
 * Hold-to-speak capture.
 *
 * Chromium MediaRecorder on Linux (especially `start(timeslice)` WebM/Opus)
 * often yields a container OpenRouter Whisper accepts with HTTP 200 and empty
 * `text`. We record PCM through AudioContext and encode 16-bit mono WAV
 * instead. MediaRecorder is only a fallback, and even then we decode back to
 * PCM before encoding WAV.
 */
export function createVoiceCapture(callbacks: VoiceCaptureCallbacks) {
  let activeGeneration: number | null = null;
  let pendingStopGeneration: number | null = null;
  let session: PcmSession | null = null;

  async function start(generation: number): Promise<void> {
    await teardown();
    activeGeneration = generation;

    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch {
      if (activeGeneration === generation) {
        activeGeneration = null;
        await callbacks.reportMicError(
          "Microphone access was denied. Allow the mic for Poppy and try again.",
        );
      }
      return;
    }

    if (activeGeneration !== generation) {
      stopTracks(stream);
      return;
    }

    try {
      session = await startPcmSession(stream);
    } catch {
      if (activeGeneration !== generation) {
        stopTracks(stream);
        return;
      }
      try {
        session = await startMediaRecorderSession(stream);
      } catch {
        stopTracks(stream);
        activeGeneration = null;
        await callbacks.reportMicError(
          "Could not start audio capture. Check the microphone and try again.",
        );
        return;
      }
    }

    if (pendingStopGeneration === generation) {
      await stop(generation);
    }
  }

  async function stop(generation: number): Promise<void> {
    pendingStopGeneration = generation;
    if (activeGeneration !== generation) {
      return;
    }
    const current = session;
    if (!current) {
      return;
    }
    session = null;
    pendingStopGeneration = null;
    activeGeneration = null;

    const { samples, sampleRate } = await current.finish();
    const peak = peakAmplitude(samples);
    const verdict = evaluateCapture({
      sampleCount: samples.length,
      peak,
      sampleRate,
    });
    if (!verdict.ok) {
      await callbacks.submitAudio({
        data: "",
        format: "wav",
        generation,
        error: verdict.reason,
      });
      return;
    }

    const wav = encodePcm16Wav(samples, sampleRate);
    await callbacks.submitAudio({
      data: arrayBufferToBase64(wav),
      format: "wav",
      generation,
    });
  }

  async function cancel(): Promise<void> {
    activeGeneration = null;
    pendingStopGeneration = null;
    await teardown();
  }

  async function teardown(): Promise<void> {
    const current = session;
    session = null;
    if (current) {
      try {
        await current.finish();
      } catch {
        /* already stopped */
      }
    }
  }

  return { start, stop, cancel };
}

async function openMicrophone(): Promise<MediaStream> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: audioTrackConstraints(),
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return stream;
  }

  const track = stream.getAudioTracks()[0];
  if (track) {
    track.enabled = true;
  }
  const label = track?.label ?? "";
  const picked = pickAudioInputId(
    devices.map((device) => ({
      kind: device.kind,
      deviceId: device.deviceId,
      label: device.label,
    })),
  );
  const currentId = track?.getSettings().deviceId;
  if (!picked || !isLikelyLoopbackLabel(label) || picked === currentId) {
    return stream;
  }

  stopTracks(stream);
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioTrackConstraints(picked),
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

async function startPcmSession(stream: MediaStream): Promise<PcmSession> {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available");
  }
  const ctx = new AudioContextCtor();
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (typeof ctx.createScriptProcessor !== "function") {
      throw new Error("ScriptProcessor is not available");
    }

    const source = ctx.createMediaStreamSource(stream);
    const chunks: Float32Array[] = [];
    let stopped = false;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (stopped) {
        return;
      }
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };

    // Pull the graph without playing to speakers (a playback stream can
    // trigger PulseAudio AEC and record digital silence on Linux).
    const sink = ctx.createMediaStreamDestination();
    source.connect(processor);
    processor.connect(sink);

    return {
      async finish() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        stopped = true;
        processor.onaudioprocess = null;
        disconnectQuietly(source, processor, sink);
        stopTracks(stream);
        try {
          await ctx.close();
        } catch {
          /* already closed */
        }
        return { samples: concatFloat32(chunks), sampleRate: ctx.sampleRate || 16_000 };
      },
    };
  } catch (error) {
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
    throw error;
  }
}

async function startMediaRecorderSession(stream: MediaStream): Promise<PcmSession> {
  const chunks: Blob[] = [];
  const mimeType = pickMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  // No timeslice: Chromium's 100ms WebM clusters are often unreadable by Whisper.
  recorder.start();

  return {
    async finish() {
      const blob = await new Promise<Blob>((resolve) => {
        if (recorder.state === "inactive") {
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          return;
        }
        recorder.addEventListener(
          "stop",
          () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" })),
          { once: true },
        );
        recorder.stop();
      });
      stopTracks(stream);
      if (blob.size < 64) {
        return { samples: new Float32Array(0), sampleRate: 16_000 };
      }
      try {
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        await ctx.close();
        const channels: Float32Array[] = [];
        for (let i = 0; i < decoded.numberOfChannels; i += 1) {
          channels.push(decoded.getChannelData(i));
        }
        return {
          samples: mixDownToMono(channels),
          sampleRate: decoded.sampleRate || 16_000,
        };
      } catch {
        return { samples: new Float32Array(0), sampleRate: 16_000 };
      }
    },
  };
}

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function disconnectQuietly(...nodes: AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
