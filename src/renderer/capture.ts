import {
  audioInputSituation,
  audioTrackConstraints,
  isLikelyLoopbackLabel,
} from "../shared/audio-devices";
import { arrayBufferToBase64 } from "../shared/base64";
import { CAPTURE_ERROR } from "../shared/capture-errors";
import {
  evaluateCapture,
  isNearSilent,
  MUTE_HINT_SECONDS,
} from "../shared/evaluate-capture";
import { classifyGetUserMediaError } from "../shared/media-errors";
import type { AudioPayload, PcmChunkPayload } from "../shared/types";
import { concatFloat32, encodePcm16, mixDownToMono, peakAmplitude, rmsAmplitude } from "../shared/wav";

interface VoiceCaptureCallbacks {
  sendChunk: (payload: PcmChunkPayload) => void;
  endAudio: (payload: { generation: number }) => void;
  submitAudio: (payload: AudioPayload & { generation: number }) => Promise<void>;
  reportMicError: (message: string) => Promise<void>;
  reportMicWarning: (message: string) => Promise<void>;
}

interface PcmSession {
  finish: () => Promise<{ samples: Float32Array; sampleRate: number; muted: boolean }>;
}

/**
 * Hold-to-speak capture.
 *
 * The renderer records PCM through AudioContext and streams 16-bit mono chunks
 * to main, which forwards them to ElevenLabs Scribe v2 Realtime. Mute, permission,
 * and digital-silence checks happen locally so we never send a muted or silent
 * stream to STT.
 *
 * MediaRecorder is only a fallback; even then we decode back to PCM before
 * streaming (at stop, if live chunks were not available).
 */
export function createVoiceCapture(callbacks: VoiceCaptureCallbacks) {
  let activeGeneration: number | null = null;
  let pendingStopGeneration: number | null = null;
  let session: PcmSession | null = null;
  let streamed = false;

  function emitChunk(generation: number, samples: Float32Array, sampleRate: number): void {
    if (samples.length === 0) {
      return;
    }
    streamed = true;
    callbacks.sendChunk({
      generation,
      pcm16: arrayBufferToBase64(encodePcm16(samples)),
      sampleRate,
    });
  }

  async function start(generation: number): Promise<void> {
    await teardown();
    activeGeneration = generation;
    streamed = false;

    let stream: MediaStream;
    try {
      stream = await openMicrophone((message) => {
        if (activeGeneration === generation) {
          void callbacks.reportMicWarning(message);
        }
      });
    } catch (error) {
      if (activeGeneration === generation) {
        activeGeneration = null;
        await callbacks.reportMicError(classifyGetUserMediaError(error).message);
      }
      return;
    }

    if (activeGeneration !== generation) {
      stopTracks(stream);
      return;
    }

    const track = stream.getAudioTracks()[0];
    const warnIfMuted = () => {
      if (activeGeneration === generation) {
        void callbacks.reportMicWarning(CAPTURE_ERROR.mutedMic);
      }
    };
    if (track?.muted) {
      warnIfMuted();
    }
    track?.addEventListener("mute", warnIfMuted);

    try {
      session = await startPcmSession(
        stream,
        () => {
          if (activeGeneration === generation) {
            void callbacks.reportMicWarning(CAPTURE_ERROR.silentMic);
          }
        },
        (samples, sampleRate) => {
          if (activeGeneration === generation) {
            emitChunk(generation, samples, sampleRate);
          }
        },
      );
    } catch {
      if (activeGeneration !== generation) {
        stopTracks(stream);
        return;
      }
      try {
        session = await startMediaRecorderSession(stream, () => {
          if (activeGeneration === generation) {
            void callbacks.reportMicWarning(CAPTURE_ERROR.silentMic);
          }
        });
      } catch {
        stopTracks(stream);
        activeGeneration = null;
        await callbacks.reportMicError(CAPTURE_ERROR.captureFailed);
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

    const { samples, sampleRate, muted } = await current.finish();
    const peak = peakAmplitude(samples);
    const rms = rmsAmplitude(samples);
    const verdict = evaluateCapture({
      sampleCount: samples.length,
      peak,
      rms,
      sampleRate,
      muted,
    });
    if (!verdict.ok) {
      await callbacks.submitAudio({
        data: "",
        format: "pcm16",
        generation,
        error: verdict.reason,
      });
      return;
    }

    if (!streamed) {
      emitChunk(generation, samples, sampleRate);
    }
    callbacks.endAudio({ generation });
  }

  async function cancel(): Promise<void> {
    activeGeneration = null;
    pendingStopGeneration = null;
    streamed = false;
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

async function queryMicrophonePermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function openMicrophone(onWarning: (message: string) => void): Promise<MediaStream> {
  const permission = await queryMicrophonePermission();
  if (permission === "denied") {
    const error = new Error(CAPTURE_ERROR.permissionDenied);
    error.name = "NotAllowedError";
    throw error;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: audioTrackConstraints(),
    });
  } catch (first) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (second) {
      throw second ?? first;
    }
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
  const situation = audioInputSituation(
    devices.map((device) => ({
      kind: device.kind,
      deviceId: device.deviceId,
      label: device.label,
    })),
  );

  if (situation.noInputs) {
    stopTracks(stream);
    const error = new Error(CAPTURE_ERROR.noMicrophone);
    error.name = "NotFoundError";
    throw error;
  }
  if (situation.onlyLoopback || isLikelyLoopbackLabel(label)) {
    onWarning(CAPTURE_ERROR.loopbackOnly);
  }

  const picked = situation.pickedId;
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

async function startPcmSession(
  stream: MediaStream,
  onLowLevel: () => void,
  onPcm: (samples: Float32Array, sampleRate: number) => void,
): Promise<PcmSession> {
  const AudioContextCtor =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    let sumSquares = 0;
    let sampleTotal = 0;
    let hinted = false;
    let heardSpeech = false;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (stopped) {
        return;
      }
      const data = new Float32Array(event.inputBuffer.getChannelData(0));
      chunks.push(data);
      for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] ?? 0;
        sumSquares += sample * sample;
      }
      sampleTotal += data.length;
      const elapsed = sampleTotal / (ctx.sampleRate || 16_000);
      const muted = stream.getAudioTracks().some((track) => track.muted);
      if (!hinted && elapsed >= MUTE_HINT_SECONDS) {
        if (muted) {
          hinted = true;
          return;
        }
        const rms = Math.sqrt(sumSquares / Math.max(1, sampleTotal));
        if (isNearSilent(rms)) {
          hinted = true;
          onLowLevel();
        }
      }
      if (muted) {
        return;
      }
      const peak = peakAmplitude(data);
      const rms = rmsAmplitude(data);
      if (!heardSpeech && isNearSilent(rms, peak)) {
        return;
      }
      heardSpeech = true;
      onPcm(data, ctx.sampleRate || 16_000);
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
        const muted = stream.getAudioTracks().some((track) => track.muted);
        stopTracks(stream);
        try {
          await ctx.close();
        } catch {
          /* already closed */
        }
        return { samples: concatFloat32(chunks), sampleRate: ctx.sampleRate || 16_000, muted };
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

async function startMediaRecorderSession(
  stream: MediaStream,
  onLowLevel: () => void,
): Promise<PcmSession> {
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
  // No timeslice: live streaming uses AudioContext PCM. This fallback dumps
  // decoded PCM at stop so main can still transcribe.
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
      const muted = stream.getAudioTracks().some((track) => track.muted);
      stopTracks(stream);
      if (blob.size < 64) {
        return { samples: new Float32Array(0), sampleRate: 16_000, muted };
      }
      try {
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        await ctx.close();
        const channels: Float32Array[] = [];
        for (let i = 0; i < decoded.numberOfChannels; i += 1) {
          channels.push(decoded.getChannelData(i));
        }
        const samples = mixDownToMono(channels);
        if (isNearSilent(rmsAmplitude(samples), peakAmplitude(samples))) {
          onLowLevel();
        }
        return {
          samples,
          sampleRate: decoded.sampleRate || 16_000,
          muted,
        };
      } catch {
        return { samples: new Float32Array(0), sampleRate: 16_000, muted };
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
