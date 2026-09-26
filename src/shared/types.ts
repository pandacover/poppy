export interface SearchResult {
  index: number;
  title: string;
  url: string;
  snippet: string;
}

export type AppPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "searching"
  | "results"
  | "opening"
  | "page"
  | "error";

export type CaptureMode = "query" | "pick";

export interface AppState {
  phase: AppPhase;
  mode: CaptureMode;
  query: string | null;
  lastTranscript: string | null;
  results: SearchResult[];
  error: string | null;
  hotkeyLabel: string;
  apiKeyConfigured: boolean;
  pageUrl: string | null;
  pageTitle: string | null;
}

export type CaptureFailure = "empty" | "silent" | "muted";

export interface AudioPayload {
  data: string;
  format: string;
  /** Set when the renderer captured nothing usable and `data` is empty. */
  error?: CaptureFailure;
}

export const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";
export const STT_MODEL = "openai/whisper-large-v3-turbo";
export const MAX_RESULTS = 5;
export const MAX_LISTEN_MS = 15_000;
