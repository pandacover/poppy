import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSttErrorMessage, extractTranscriptText } from "./stt-response";

describe("extractTranscriptText", () => {
  it("reads OpenRouter's default { text, usage } body", () => {
    assert.equal(
      extractTranscriptText({
        text: "  weather in Berlin  ",
        usage: { seconds: 3.2 },
      }),
      "weather in Berlin",
    );
  });

  it("joins verbose_json segments when text is missing", () => {
    assert.equal(
      extractTranscriptText({
        segments: [{ text: "hello" }, { text: "there" }],
      }),
      "hello there",
    );
  });

  it("reads chat-style choices used by some providers", () => {
    assert.equal(
      extractTranscriptText({
        choices: [{ message: { content: "open the third result" } }],
      }),
      "open the third result",
    );
  });

  it("unwraps a nested data object", () => {
    assert.equal(
      extractTranscriptText({ data: { text: "cached query" } }),
      "cached query",
    );
  });

  it("treats whitespace-only text as empty", () => {
    assert.equal(extractTranscriptText({ text: "   \n" }), "");
    assert.equal(extractTranscriptText(null), "");
    assert.equal(extractTranscriptText({ usage: { seconds: 1 } }), "");
  });
});

describe("extractSttErrorMessage", () => {
  it("reads OpenRouter error objects", () => {
    assert.equal(
      extractSttErrorMessage({ error: { message: "Provider returned error" } }),
      "Provider returned error",
    );
    assert.equal(extractSttErrorMessage({ error: "nope" }), "nope");
    assert.equal(extractSttErrorMessage({ text: "ok" }), undefined);
  });
});
