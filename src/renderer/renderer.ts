import { createVoiceCapture } from "./capture";
import type { AppState } from "../shared/types";

const searchBar = document.querySelector("#search-bar") as HTMLElement;
const searchText = document.querySelector("#search-text") as HTMLElement;
const shortcut = document.querySelector("#shortcut") as HTMLElement;
const hint = document.querySelector("#hint") as HTMLElement;
const errorEl = document.querySelector("#error") as HTMLElement;
const resultsEl = document.querySelector("#results") as HTMLOListElement;
const pagebar = document.querySelector("#pagebar") as HTMLElement;
const titlebar = document.querySelector("#titlebar") as HTMLElement;
const pageTitleEl = document.querySelector("#page-title") as HTMLElement;
const backBtn = document.querySelector("#btn-back") as HTMLButtonElement;
const minBtn = document.querySelector("#btn-min") as HTMLButtonElement;
const hideBtn = document.querySelector("#btn-hide") as HTMLButtonElement;
const appEl = document.querySelector("#app") as HTMLElement;
const glass = document.querySelector("#glass") as HTMLElement;
const stage = document.querySelector("#stage") as HTMLElement;

const SEARCH_PLACEHOLDER = "What are you looking for?";

let current: AppState | null = null;
let fitRaf = 0;

const capture = createVoiceCapture({
  submitAudio: (payload) => window.poppy.submitAudio(payload),
  reportMicError: (message) => window.poppy.reportMicError(message),
  reportMicWarning: (message) => window.poppy.reportMicWarning(message),
});

function pageOpen(state: AppState): boolean {
  return state.phase === "page" || state.phase === "opening";
}

function searchCopy(state: AppState): { text: string; placeholder: boolean } {
  if (state.phase === "listening") {
    return {
      text: state.mode === "pick" ? "Listening for a number…" : "Listening…",
      placeholder: false,
    };
  }
  if (state.phase === "transcribing") {
    return { text: "Transcribing…", placeholder: false };
  }
  if (state.phase === "searching") {
    return { text: state.query || "Searching…", placeholder: false };
  }
  if (state.phase === "opening") {
    return { text: "Loading page…", placeholder: false };
  }
  if (state.query) {
    return { text: state.query, placeholder: false };
  }
  return { text: SEARCH_PLACEHOLDER, placeholder: true };
}

function hintCopy(state: AppState): string {
  const hotkey = state.hotkeyLabel;
  if (state.phase === "listening") {
    return state.mode === "pick"
      ? `Release ${hotkey} when you’ve said a number`
      : `Release ${hotkey} when you’re done speaking`;
  }
  if (state.phase === "results") {
    return `Hold ${hotkey} and say 1–${state.results.length} to open. Click a row if you prefer.`;
  }
  if (state.phase === "idle") {
    return "";
  }
  if (state.phase === "transcribing") {
    return "Sending audio to Whisper…";
  }
  if (state.phase === "searching") {
    return "Looking up organic results…";
  }
  if (state.phase === "opening") {
    return "Loading page inside Poppy…";
  }
  if (state.phase === "page") {
    return `Back to results, or hold ${hotkey} to search again.`;
  }
  return `Hold ${hotkey} to try again.`;
}

function scheduleFit(): void {
  if (fitRaf) {
    return;
  }
  fitRaf = requestAnimationFrame(() => {
    fitRaf = 0;
    if (!current || pageOpen(current) || typeof window.poppy?.fitWindow !== "function") {
      return;
    }
    const stageStyles = getComputedStyle(stage);
    const padX = parseFloat(stageStyles.paddingLeft) + parseFloat(stageStyles.paddingRight);
    const padY = parseFloat(stageStyles.paddingTop) + parseFloat(stageStyles.paddingBottom);
    const rect = glass.getBoundingClientRect();
    void window.poppy.fitWindow({
      width: Math.ceil(rect.width + padX),
      height: Math.ceil(rect.height + padY),
    });
  });
}

function render(state: AppState): void {
  current = state;
  const viewing = pageOpen(state);
  const copy = searchCopy(state);

  document.body.dataset.phase = state.phase;
  document.body.dataset.page = viewing ? "open" : "";
  appEl.dataset.page = viewing ? "open" : "";
  searchBar.dataset.phase = state.phase;
  searchText.textContent = copy.text;
  searchText.classList.toggle("is-placeholder", copy.placeholder);
  shortcut.hidden = state.phase !== "idle";

  const nextHint = hintCopy(state);
  hint.hidden = !nextHint;
  hint.textContent = nextHint;

  errorEl.hidden = !state.error;
  errorEl.textContent = state.error ?? "";

  titlebar.hidden = !viewing;
  pagebar.hidden = !viewing;
  pageTitleEl.textContent = viewing
    ? state.error || state.pageTitle || state.pageUrl || "Loading…"
    : "";
  pageTitleEl.classList.toggle("is-error", Boolean(viewing && state.error));

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

  scheduleFit();
}

function idlePreview(): AppState {
  return {
    phase: "idle",
    mode: "query",
    query: null,
    lastTranscript: null,
    results: [],
    error: null,
    hotkeyLabel: "⌘/",
    apiKeyConfigured: true,
    pageUrl: null,
    pageTitle: null,
  };
}

function resultsPreview(): AppState {
  return {
    ...idlePreview(),
    phase: "results",
    mode: "pick",
    query: "best espresso in lisbon",
    lastTranscript: "best espresso in lisbon",
    results: [
      {
        index: 1,
        title: "Where to drink espresso in Lisbon",
        url: "https://example.com/lisbon-espresso",
        snippet: "A short guide to neighborhood cafés, from Baixa counters to Príncipe Real hideaways.",
      },
      {
        index: 2,
        title: "Lisbon coffee map",
        url: "https://example.com/coffee-map",
        snippet: "Independent roasters and classic pastelaria bars ranked by shot quality and atmosphere.",
      },
      {
        index: 3,
        title: "The best cafés near tram 28",
        url: "https://example.com/tram-cafes",
        snippet: "Quick stops for a bica if you are hopping on and off the old route.",
      },
    ],
  };
}

function previewFromQuery(): AppState | null {
  const mode = new URLSearchParams(location.search).get("preview");
  if (mode === "idle") {
    return idlePreview();
  }
  if (mode === "results") {
    return resultsPreview();
  }
  return null;
}

const hasPoppy = typeof window.poppy?.getState === "function";

if (hasPoppy) {
  minBtn.addEventListener("click", () => {
    void window.poppy.minimize();
  });
  hideBtn.addEventListener("click", () => {
    void window.poppy.hide();
  });
  backBtn.addEventListener("click", () => {
    void window.poppy.closePage();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (current && pageOpen(current)) {
        void window.poppy.closePage();
      } else {
        void window.poppy.cancelListen();
      }
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

  const resizeObserver = new ResizeObserver(() => scheduleFit());
  resizeObserver.observe(glass);
} else {
  const preview = previewFromQuery();
  if (preview) {
    render(preview);
  }
}
