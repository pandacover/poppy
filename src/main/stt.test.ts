import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTURE_ERROR } from "../shared/capture-errors";
import { arrayBufferToBase64 } from "../shared/base64";
import type { DebounceTimers } from "../shared/search-debounce";
import { createRealtimeSession, mapSttError, type RealtimeSocket } from "./stt";

function pcmChunk(sampleRate = 16_000, bytes = 3200): { pcm16: string; sampleRate: number } {
  return { pcm16: arrayBufferToBase64(new ArrayBuffer(bytes)), sampleRate };
}

function manualTimers(): { timers: DebounceTimers; drain: () => void; tick: () => void } {
  let nextId = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  const timers: DebounceTimers = {
    setTimeout: (fn, ms) => {
      const id = ++nextId;
      pending.set(id, { fn, ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as unknown as number);
    },
  };
  return {
    timers,
    drain() {
      let steps = 0;
      while (pending.size > 0 && steps < 20) {
        steps += 1;
        const first = pending.entries().next().value;
        if (!first) {
          return;
        }
        const [id, item] = first;
        pending.delete(id);
        item.fn();
      }
    },
    tick() {
      const first = pending.entries().next().value;
      if (!first) {
        return;
      }
      const [id, item] = first;
      pending.delete(id);
      item.fn();
    },
  };
}

class FakeSocket implements RealtimeSocket {
  sent: { audioBase64: string; sampleRate?: number }[] = [];
  commits = 0;
  closed = false;
  private listeners = new Map<string, Array<(data?: unknown) => void>>();

  on(event: string, listener: (data?: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  emit(event: string, data?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(data);
    }
  }

  send(data: { audioBase64: string; sampleRate?: number }): void {
    this.sent.push(data);
  }

  commit(): void {
    this.commits += 1;
  }

  close(): void {
    this.closed = true;
  }
}

describe("mapSttError", () => {
  it("maps auth failures to the ElevenLabs key message", () => {
    assert.match(
      mapSttError({ message_type: "auth_error", error: "invalid" }).message,
      /ELEVENLABS_API_KEY/,
    );
  });

  it("maps empty activity to the empty-transcript copy", () => {
    assert.equal(
      mapSttError({ message_type: "insufficient_audio_activity", error: "none" }).message,
      CAPTURE_ERROR.emptyTranscript,
    );
  });

  it("maps network-ish websocket errors", () => {
    assert.equal(mapSttError(new Error("WebSocket is not connected")).message, CAPTURE_ERROR.network);
  });
});

describe("createRealtimeSession", () => {
  it("updates partials live and searches once on a settled commit after release", async () => {
    const { timers, drain } = manualTimers();
    const socket = new FakeSocket();
    const partials: string[] = [];
    const settled: string[] = [];
    const session = createRealtimeSession({
      apiKey: "sk-test",
      generation: 1,
      connect: async () => socket,
      onPartial: (text) => partials.push(text),
      onSettled: (text) => settled.push(text),
      onError: (error) => {
        throw error;
      },
      debounceMs: 250,
      silenceMs: 250,
      commitGraceMs: 400,
      timers,
    });

    await session.push(pcmChunk());
    socket.emit("open");
    socket.emit("partial_transcript", { text: "best espresso" });
    socket.emit("committed_transcript", { text: "best espresso in lisbon" });
    assert.deepEqual(partials, ["best espresso", "best espresso in lisbon"]);
    assert.deepEqual(settled, []);

    session.release();
    drain();
    assert.deepEqual(settled, ["best espresso in lisbon"]);
    assert.equal(socket.closed, true);
  });

  it("debounces duplicate commits so search runs once", async () => {
    const { timers, drain } = manualTimers();
    const socket = new FakeSocket();
    const settled: string[] = [];
    const session = createRealtimeSession({
      apiKey: "sk-test",
      generation: 2,
      connect: async () => socket,
      onPartial: () => undefined,
      onSettled: (text) => settled.push(text),
      onError: (error) => {
        throw error;
      },
      debounceMs: 250,
      silenceMs: 250,
      commitGraceMs: 400,
      timers,
    });

    await session.push(pcmChunk());
    socket.emit("open");
    session.release();
    socket.emit("committed_transcript", { text: "cats near me" });
    socket.emit("committed_transcript", { text: "cats near me." });
    drain();
    assert.deepEqual(settled, ["cats near me"]);
  });

  it("manual-commits leftover partials after the local silence wait", async () => {
    const { timers, tick, drain } = manualTimers();
    const socket = new FakeSocket();
    const settled: string[] = [];
    const session = createRealtimeSession({
      apiKey: "sk-test",
      generation: 3,
      connect: async () => socket,
      onPartial: () => undefined,
      onSettled: (text) => settled.push(text),
      onError: (error) => {
        throw error;
      },
      debounceMs: 50,
      silenceMs: 250,
      commitGraceMs: 400,
      timers,
    });

    await session.push(pcmChunk());
    socket.emit("open");
    socket.emit("partial_transcript", { text: "three" });
    session.release();
    assert.equal(socket.commits, 0);
    tick();
    assert.equal(socket.commits, 1);
    socket.emit("committed_transcript", { text: "three" });
    drain();
    assert.deepEqual(settled, ["three"]);
  });

  it("does not search after abort", async () => {
    const { timers, drain } = manualTimers();
    const socket = new FakeSocket();
    const settled: string[] = [];
    const session = createRealtimeSession({
      apiKey: "sk-test",
      generation: 4,
      connect: async () => socket,
      onPartial: () => undefined,
      onSettled: (text) => settled.push(text),
      onError: (error) => {
        throw error;
      },
      timers,
    });

    await session.push(pcmChunk());
    socket.emit("open");
    socket.emit("committed_transcript", { text: "should not search" });
    session.abort();
    session.release();
    drain();
    assert.deepEqual(settled, []);
  });
});
