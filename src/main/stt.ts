import {
  AudioFormat,
  CommitStrategy,
  ElevenLabsClient,
  RealtimeEvents,
  type RealtimeConnection,
} from "@elevenlabs/elevenlabs-js";
import { base64ByteLength } from "../shared/base64";
import { CAPTURE_ERROR } from "../shared/capture-errors";
import { createSearchDebouncer, type DebounceTimers } from "../shared/search-debounce";
import {
  COMMIT_GRACE_MS,
  isNearDuplicateQuery,
  joinTranscript,
  LOCAL_SILENCE_MS,
  nearestPcmSampleRate,
  pcmDurationMs,
  releasePadMs,
  SEARCH_DEBOUNCE_MS,
  silencePcm16Base64,
  STT_LANGUAGE_CODE,
  STT_MODEL,
  VAD_SILENCE_THRESHOLD_SECS,
} from "../shared/stt-timing";

export { STT_LANGUAGE_CODE, STT_MODEL, VAD_SILENCE_THRESHOLD_SECS };

const AUDIO_FORMAT: Record<number, AudioFormat> = {
  8_000: AudioFormat.PCM_8000,
  16_000: AudioFormat.PCM_16000,
  22_050: AudioFormat.PCM_22050,
  24_000: AudioFormat.PCM_24000,
  44_100: AudioFormat.PCM_44100,
  48_000: AudioFormat.PCM_48000,
};

export interface RealtimeSocket {
  on(event: string, listener: (data?: unknown) => void): void;
  send(data: { audioBase64: string; sampleRate?: number }): void;
  commit(): void;
  close(): void;
}

export type ConnectRealtime = (input: {
  apiKey: string;
  sampleRate: number;
}) => Promise<RealtimeSocket>;

export interface PcmChunk {
  pcm16: string;
  sampleRate: number;
}

export interface RealtimeSessionOptions {
  apiKey: string;
  generation: number;
  connect: ConnectRealtime;
  onPartial: (text: string) => void;
  onSettled: (text: string) => void;
  onError: (error: Error) => void;
  debounceMs?: number;
  silenceMs?: number;
  commitGraceMs?: number;
  timers?: DebounceTimers;
}

export interface RealtimeSession {
  generation: number;
  push(chunk: PcmChunk): Promise<void>;
  release(): void;
  abort(): void;
}

const defaultTimers: DebounceTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

function transcriptText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }
  const rec = data as Record<string, unknown>;
  if (typeof rec.text === "string") {
    return rec.text.trim();
  }
  if (typeof rec.transcript === "string") {
    return rec.transcript.trim();
  }
  return "";
}

export function mapSttError(error: unknown): Error {
  const rec = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const type = typeof rec?.message_type === "string" ? rec.message_type : "";
  const msg =
    typeof rec?.error === "string" && rec.error.trim()
      ? rec.error.trim()
      : error instanceof Error
        ? error.message
        : "";

  if (type === "auth_error" || /401|403|unauthor|invalid api key|api key/i.test(msg)) {
    return new Error("ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.");
  }
  if (type === "quota_exceeded") {
    return new Error("ElevenLabs quota exceeded. Check your plan or credits.");
  }
  if (type === "insufficient_audio_activity") {
    return new Error(CAPTURE_ERROR.emptyTranscript);
  }
  if (error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message))) {
    return new Error(CAPTURE_ERROR.timeout);
  }
  if (/enotfound|econn|network|websocket is closed|websocket is not/i.test(msg)) {
    return new Error(CAPTURE_ERROR.network);
  }
  return new Error(msg || "Speech-to-text failed.");
}

export async function connectScribe(input: { apiKey: string; sampleRate: number }): Promise<RealtimeSocket> {
  const client = new ElevenLabsClient({ apiKey: input.apiKey });
  const sampleRate = nearestPcmSampleRate(input.sampleRate);
  const audioFormat = AUDIO_FORMAT[sampleRate] ?? AudioFormat.PCM_16000;
  const connection: RealtimeConnection = await client.speechToText.realtime.connect({
    modelId: STT_MODEL,
    audioFormat,
    sampleRate: input.sampleRate,
    languageCode: STT_LANGUAGE_CODE,
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: VAD_SILENCE_THRESHOLD_SECS,
    minSpeechDurationMs: 50,
    minSilenceDurationMs: 50,
  });
  return connection as RealtimeSocket;
}

/**
 * One hold-to-speak utterance: stream PCM16 to Scribe, show partials, search
 * only after a committed/settled query (VAD ~0.3s + local 250ms on release).
 */
export function createRealtimeSession(options: RealtimeSessionOptions): RealtimeSession {
  const timers = options.timers ?? defaultTimers;
  const debounceMs = options.debounceMs ?? SEARCH_DEBOUNCE_MS;
  const silenceMs = options.silenceMs ?? LOCAL_SILENCE_MS;
  const commitGraceMs = options.commitGraceMs ?? COMMIT_GRACE_MS;
  const debounce = createSearchDebouncer(debounceMs, timers);

  let connection: RealtimeSocket | null = null;
  let connecting: Promise<void> | null = null;
  let ready = false;
  let sampleRate = 16_000;
  let bytesSent = 0;
  const pending: PcmChunk[] = [];
  const committed: string[] = [];
  let partial = "";
  let closed = false;
  let released = false;
  let settled = false;
  let failed = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers(): void {
    if (silenceTimer != null) {
      timers.clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (graceTimer != null) {
      timers.clearTimeout(graceTimer);
      graceTimer = null;
    }
    debounce.cancel();
  }

  function liveText(includePartial = true): string {
    return joinTranscript(committed, includePartial ? partial : "");
  }

  function closeSession(): void {
    closed = true;
    clearTimers();
    const conn = connection;
    connection = null;
    ready = false;
    pending.length = 0;
    if (conn) {
      try {
        conn.close();
      } catch {
        /* already closed */
      }
    }
  }

  function fail(error: Error): void {
    if (closed || failed || settled) {
      return;
    }
    failed = true;
    options.onError(error);
    closeSession();
  }

  function sendChunk(chunk: PcmChunk): void {
    if (!connection || !ready) {
      pending.push(chunk);
      return;
    }
    try {
      connection.send({ audioBase64: chunk.pcm16, sampleRate: chunk.sampleRate });
      bytesSent += base64ByteLength(chunk.pcm16);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/not connected|not open/i.test(message)) {
        pending.push(chunk);
        return;
      }
      fail(mapSttError(error));
    }
  }

  function flushPending(): void {
    if (!connection || !ready) {
      return;
    }
    const queued = pending.splice(0, pending.length);
    for (const chunk of queued) {
      sendChunk(chunk);
    }
  }

  function attach(conn: RealtimeSocket): void {
    connection = conn;
    const markReady = () => {
      if (closed) {
        return;
      }
      ready = true;
      flushPending();
    };
    conn.on(RealtimeEvents.OPEN, markReady);
    conn.on(RealtimeEvents.SESSION_STARTED, markReady);
    conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
      if (closed || failed) {
        return;
      }
      partial = transcriptText(data);
      const text = liveText();
      if (text) {
        options.onPartial(text);
      }
    });
    conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
      if (closed || failed) {
        return;
      }
      const text = transcriptText(data);
      if (text) {
        const last = committed[committed.length - 1];
        if (!last || !isNearDuplicateQuery(text, last)) {
          committed.push(text);
        }
        partial = "";
        options.onPartial(liveText());
      }
      if (released) {
        settle(false);
      }
    });
    conn.on(RealtimeEvents.ERROR, (error) => {
      fail(mapSttError(error));
    });
    conn.on(RealtimeEvents.AUTH_ERROR, (error) => {
      fail(mapSttError(error));
    });
    conn.on(RealtimeEvents.CLOSE, () => {
      if (!closed && released && !settled && !failed) {
        settle(true);
      }
    });
  }

  async function ensureConnection(rate: number): Promise<void> {
    if (closed || failed) {
      return;
    }
    if (connection) {
      await connecting;
      return;
    }
    if (connecting) {
      await connecting;
      return;
    }
    sampleRate = rate;
    connecting = (async () => {
      try {
        const conn = await options.connect({ apiKey: options.apiKey, sampleRate: rate });
        if (closed || failed) {
          try {
            conn.close();
          } catch {
            /* ignore */
          }
          return;
        }
        attach(conn);
        console.info(
          "[poppy:stt]",
          JSON.stringify({
            model: STT_MODEL,
            sampleRate: rate,
            vadSilenceSecs: VAD_SILENCE_THRESHOLD_SECS,
            localSilenceMs: silenceMs,
          }),
        );
      } catch (error) {
        fail(mapSttError(error));
      }
    })();
    await connecting;
  }

  function settle(force: boolean): void {
    if (closed || failed || settled) {
      return;
    }
    const text = liveText(force);
    if (!text) {
      if (force) {
        fail(new Error(CAPTURE_ERROR.emptyTranscript));
      }
      return;
    }
    debounce.schedule(text, (query) => {
      if (closed || failed || settled) {
        return;
      }
      settled = true;
      clearTimers();
      options.onSettled(query);
      closeSession();
    });
  }

    function requestManualCommit(): void {
    if (!connection && connecting) {
      void connecting.then(() => {
        if (!closed && !failed && !settled) {
          requestManualCommit();
        }
      });
      return;
    }
    if (!connection || !ready) {
      settle(true);
      return;
    }
    try {
      connection.commit();
    } catch {
      settle(true);
      return;
    }
    graceTimer = timers.setTimeout(() => {
      graceTimer = null;
      settle(true);
    }, commitGraceMs);
  }

  return {
    generation: options.generation,
    async push(chunk) {
      if (closed || failed || released) {
        return;
      }
      await ensureConnection(chunk.sampleRate);
      if (closed || failed) {
        return;
      }
      sendChunk(chunk);
    },
    release() {
      if (closed || failed || released) {
        return;
      }
      released = true;
      const alreadyMs = pcmDurationMs(bytesSent, sampleRate);
      const padMs = releasePadMs(alreadyMs);
      if (padMs > 0 && (connection || pending.length > 0)) {
        sendChunk({
          pcm16: silencePcm16Base64(sampleRate, padMs),
          sampleRate,
        });
      }
      // VAD already waited ~0.3s if we have a commit and no leftover partial.
      if (liveText(false) && !partial) {
        settle(false);
        return;
      }
      silenceTimer = timers.setTimeout(() => {
        silenceTimer = null;
        if (closed || failed || settled) {
          return;
        }
        const text = liveText();
        if (text && !partial) {
          settle(false);
          return;
        }
        requestManualCommit();
      }, silenceMs);
    },
    abort: closeSession,
  };
}
