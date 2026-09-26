import { STT_MODEL } from "../shared/types";
import { normalizeAudioFormat } from "../shared/audio-format";
import { base64ByteLength } from "../shared/base64";
import { CAPTURE_ERROR } from "../shared/capture-errors";
import {
  extractSttErrorMessage,
  extractTranscriptText,
  responseKeys,
} from "../shared/stt-response";

export async function transcribeAudio(
  apiKey: string,
  audio: { data: string; format: string },
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const format = normalizeAudioFormat(audio.format);
  const bytes = base64ByteLength(audio.data);

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/pandacover/poppy",
        "X-OpenRouter-Title": "Poppy",
      },
      body: JSON.stringify({
        model: STT_MODEL,
        input_audio: {
          data: audio.data,
          format,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(CAPTURE_ERROR.timeout);
    }
    throw new Error(CAPTURE_ERROR.network);
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  console.info(
    "[poppy:stt]",
    JSON.stringify({
      format,
      bytes,
      status: response.status,
      keys: responseKeys(payload),
    }),
  );

  if (!response.ok) {
    const message = extractSttErrorMessage(payload) || `Speech-to-text failed (${response.status}).`;
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenRouter rejected the API key. Check OPENROUTER_API_KEY.");
    }
    throw new Error(message);
  }

  const text = extractTranscriptText(payload);
  if (!text) {
    const nested = extractSttErrorMessage(payload);
    if (nested) {
      throw new Error(nested);
    }
    throw new Error(CAPTURE_ERROR.emptyTranscript);
  }
  return text;
}
