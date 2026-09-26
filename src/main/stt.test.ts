import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CAPTURE_ERROR } from "../shared/capture-errors";
import { transcribeAudio } from "./stt";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockJson(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

describe("transcribeAudio", () => {
  it("returns OpenRouter text on success", async () => {
    mockJson(200, { text: "  cats near me ", usage: { seconds: 2 } });
    const text = await transcribeAudio("sk-test", { data: "UklGRg==", format: "audio/wav" });
    assert.equal(text, "cats near me");
  });

  it("sends wav when the renderer MIME includes codecs", async () => {
    let format: string | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        input_audio?: { format?: string };
      };
      format = body.input_audio?.format;
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    await transcribeAudio("sk-test", { data: "UklGRg==", format: "wav" });
    assert.equal(format, "wav");
  });

  it("throws a specific error when the provider returns empty text", async () => {
    mockJson(200, { text: "  ", usage: { seconds: 5.1 } });
    await assert.rejects(
      () => transcribeAudio("sk-test", { data: "UklGRg==", format: "wav" }),
      (error: unknown) => {
        assert.equal(error instanceof Error && error.message, CAPTURE_ERROR.emptyTranscript);
        return true;
      },
    );
  });

  it("surfaces HTTP failures instead of the empty-catch copy", async () => {
    mockJson(400, { error: { message: "Invalid audio format" } });
    await assert.rejects(
      () => transcribeAudio("sk-test", { data: "UklGRg==", format: "webm" }),
      /Invalid audio format/,
    );
  });

  it("reads transcript text from verbose segments", async () => {
    mockJson(200, { segments: [{ text: "number" }, { text: "three" }] });
    const text = await transcribeAudio("sk-test", { data: "UklGRg==", format: "wav" });
    assert.equal(text, "number three");
  });
});
