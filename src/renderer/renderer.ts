import type { AppState } from "../shared/types";

const pill = document.querySelector("#pill") as HTMLElement;
const pillText = document.querySelector("#pill-text") as HTMLElement;
const hint = document.querySelector("#hint") as HTMLElement;
const queryEl = document.querySelector("#query") as HTMLElement;
const errorEl = document.querySelector("#error") as HTMLElement;
const resultsEl = document.querySelector("#results") as HTMLOListElement;
const minBtn = document.querySelector("#btn-min") as HTMLButtonElement;
const hideBtn = document.querySelector("#btn-hide") as HTMLButtonElement;

let current: AppState | null = null;
let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let chunks: Blob[] = [];
let activeGeneration: number | null = null;
let pendingStopGeneration: number | null = null;

const PHASE_LABEL: Record<AppState["phase"], string> = {
  idle: "Ready",
  listening: "Listening",
  transcribing: "Transcribing",
  searching: "Searching",
  results: "Results",
  opening: "Opening",
  error: "Needs attention",
};

function render(state: AppState): void {
  current = state;
  pill.dataset.phase = state.phase;
  pillText.textContent = PHASE_LABEL[state.phase];

  const hotkey = state.hotkeyLabel;
  if (state.phase === "listening") {
    hint.textContent =
      state.mode === "pick"
        ? `Release ${hotkey} when you’ve said a number`
        : `Release ${hotkey} when you’re done speaking`;
  } else if (state.phase === "results") {
    hint.textContent = `Hold ${hotkey} and say 1–${state.results.length} to open. Click a row if you prefer.`;
  } else if (state.phase === "idle") {
    hint.textContent = `Hold ${hotkey} and speak a search.`;
  } else if (state.phase === "transcribing") {
    hint.textContent = "Sending audio to Whisper…";
  } else if (state.phase === "searching") {
    hint.textContent = "Looking up organic results…";
  } else if (state.phase === "opening") {
    hint.textContent = "Opening in your browser…";
  } else {
    hint.textContent = `Hold ${hotkey} to try again.`;
  }

  if (state.query) {
    queryEl.hidden = false;
    queryEl.textContent = `“${state.query}”`;
  } else {
    queryEl.hidden = true;
    queryEl.textContent = "";
  }

  errorEl.hidden = !state.error;
  errorEl.textContent = state.error ?? "";

  resultsEl.replaceChildren();
  for (const result of state.results) {
    const item = document.createElement("li");
    item.tabIndex = 0;
    item.dataset.index = String(result.index);
    item.innerHTML = `
      <span class="idx">${result.index}</span>
      <div>
        <h2></h2>
        <p></p>
      </div>
    `;
    item.querySelector("h2")!.textContent = result.title;
    item.querySelector("p")!.textContent = result.snippet;
    item.addEventListener("click", () => {
      void window.poppy.openResult(result.index);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void window.poppy.openResult(result.index);
      }
    });
    resultsEl.append(item);
  }
}

async function startRecording(generation: number): Promise<void> {
  await stopTracks(false);
  activeGeneration = generation;
  chunks = [];
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    if (activeGeneration === generation) {
      activeGeneration = null;
      await window.poppy.reportMicError(
        "Microphone access was denied. Allow the mic for Poppy and try again.",
      );
    }
    return;
  }

  if (activeGeneration !== generation) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    return;
  }

  const mimeType = pickMimeType();
  mediaRecorder = mimeType
    ? new MediaRecorder(mediaStream, { mimeType })
    : new MediaRecorder(mediaStream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  mediaRecorder.start(100);
  if (pendingStopGeneration === generation) {
    await stopAndSubmit(generation);
  }
}

async function stopAndSubmit(generation: number): Promise<void> {
  pendingStopGeneration = generation;
  const recorder = mediaRecorder;
  if (!recorder) {
    return;
  }
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
  await stopTracks(false);
  pendingStopGeneration = null;
  if (activeGeneration !== generation) {
    return;
  }
  activeGeneration = null;
  if (blob.size < 64) {
    await window.poppy.submitAudio({ data: "", format: "webm", generation });
    return;
  }
  const data = await blobToBase64(blob);
  const format = (blob.type.split(";")[0] || "audio/webm").replace("audio/", "") || "webm";
  await window.poppy.submitAudio({ data, format, generation });
}

async function stopTracks(resetGeneration = true): Promise<void> {
  mediaRecorder = null;
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  chunks = [];
  if (resetGeneration) {
    activeGeneration = null;
    pendingStopGeneration = null;
  }
}

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

minBtn.addEventListener("click", () => {
  void window.poppy.minimize();
});
hideBtn.addEventListener("click", () => {
  void window.poppy.hide();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void window.poppy.cancelListen();
    return;
  }
  if (current?.phase === "results" && /^[1-5]$/.test(event.key)) {
    void window.poppy.openResult(Number(event.key));
  }
});

window.addEventListener(
  "keyup",
  (event) => {
    void window.poppy.notifyKeyUp({ key: event.key, code: event.code });
  },
  true,
);

window.poppy.onState(render);
window.poppy.onHotkeyDown(({ generation }) => {
  void startRecording(generation);
});
window.poppy.onHotkeyUp(({ generation }) => {
  void stopAndSubmit(generation);
});
window.poppy.onHotkeyCancel(() => {
  void stopTracks(true);
});

void window.poppy.getState().then(render);
