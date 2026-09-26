import { createVoiceCapture } from "./capture";
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

const capture = createVoiceCapture({
  submitAudio: (payload) => window.poppy.submitAudio(payload),
  reportMicError: (message) => window.poppy.reportMicError(message),
});

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
  void capture.start(generation);
});
window.poppy.onHotkeyUp(({ generation }) => {
  void capture.stop(generation);
});
window.poppy.onHotkeyCancel(() => {
  void capture.cancel();
});

void window.poppy.getState().then(render);
