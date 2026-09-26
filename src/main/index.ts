import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session,
  systemPreferences,
} from "electron";
import { join } from "node:path";
import { getHotkeyAccelerator, getOpenRouterApiKey, loadEnv } from "./env";
import { createHoldHotkey } from "./hotkey";
import { createPageView } from "./page-view";
import { disposeScraper, searchWeb } from "./search";
import { transcribeAudio } from "./stt";
import { formatHotkeyLabel } from "../shared/hotkey";
import { CAPTURE_ERROR, messageForCapturePayload } from "../shared/capture-errors";
import {
  LAUNCHER_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_MIN_WIDTH,
  LAUNCHER_WIDTH,
} from "../shared/page-layout";
import { parseSpokenIndex } from "../shared/parse-number";
import { resultOpenError } from "../shared/safe-url";
import type { AppState, AudioPayload } from "../shared/types";

loadEnv(process.cwd());
app.setName("Poppy");
app.disableHardwareAcceleration();
// Hold-to-speak is triggered by a global shortcut, not a page gesture.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let listenGeneration = 0;
let awaitingCapture = false;
let hold: ReturnType<typeof createHoldHotkey> | null = null;
const pageView = createPageView(
  () => mainWindow,
  {
    onTitle: (title) => {
      if (pageView.isOpen() && (state.phase === "page" || state.phase === "opening")) {
        setState({ pageTitle: title });
      }
    },
    onNavigated: (url) => {
      if (pageView.isOpen() && (state.phase === "page" || state.phase === "opening")) {
        setState({ pageUrl: url });
      }
    },
    onFail: (message) => {
      if (!pageView.isOpen()) {
        return;
      }
      if (state.phase === "opening") {
        closePage({ error: message });
        return;
      }
      if (state.phase === "page") {
        setState({ error: message });
      }
    },
    onCloseRequest: () => {
      closePage();
    },
  },
);

const accelerator = getHotkeyAccelerator();

const state: AppState = {
  phase: "idle",
  mode: "query",
  query: null,
  lastTranscript: null,
  results: [],
  error: null,
  hotkeyLabel: formatHotkeyLabel(accelerator, process.platform),
  apiKeyConfigured: Boolean(getOpenRouterApiKey()),
  pageUrl: null,
  pageTitle: null,
};

function sendState(): void {
  mainWindow?.webContents.send("state:update", { ...state, results: [...state.results] });
}

function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  sendState();
}

function busyPhase(): boolean {
  return (
    awaitingCapture ||
    state.phase === "transcribing" ||
    state.phase === "searching"
  );
}

function closePage(options?: { error?: string | null }): void {
  pageView.close();
  setState({
    phase: state.results.length > 0 ? "results" : "idle",
    mode: state.results.length > 0 ? "pick" : "query",
    pageUrl: null,
    pageTitle: null,
    error: options?.error ?? null,
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: LAUNCHER_WIDTH,
    height: LAUNCHER_HEIGHT,
    minWidth: LAUNCHER_MIN_WIDTH,
    minHeight: LAUNCHER_MIN_HEIGHT,
    show: false,
    frame: false,
    backgroundColor: "#161411",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  win.loadFile(join(__dirname, "../renderer/index.html"));
  win.once("ready-to-show", () => {
    win.show();
  });
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  return win;
}

function attachIpc(): void {
  ipcMain.handle("state:get", () => ({ ...state, results: [...state.results] }));
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });
  ipcMain.handle("window:hide", () => {
    mainWindow?.hide();
  });
  ipcMain.handle("hotkey:keyup", (_event, input: { key?: string; code?: string }) => {
    hold?.notifyPossibleRelease(input);
  });
  ipcMain.handle("listen:cancel", () => {
    cancelListening();
  });
  ipcMain.handle("audio:submit", async (_event, payload: AudioPayload & { generation?: number }) => {
    await handleAudio(payload);
  });
  ipcMain.handle("results:open", async (_event, index: number) => {
    await openResult(index);
  });
  ipcMain.handle("page:close", () => {
    closePage();
  });
  ipcMain.handle("mic:error", (_event, message: string) => {
    awaitingCapture = false;
    hold?.cancel();
    setState({
      phase: state.results.length > 0 ? "results" : "error",
      error: message || CAPTURE_ERROR.permissionDenied,
    });
  });
  ipcMain.handle("mic:warn", (_event, message: string) => {
    if (state.phase !== "listening") {
      return;
    }
    setState({
      error: message || CAPTURE_ERROR.silentMic,
    });
  });
}

function startListening(): void {
  if (pageView.isOpen() || state.phase === "page" || state.phase === "opening") {
    pageView.close();
  }
  if (microphoneAccessDenied()) {
    setState({
      phase: state.results.length > 0 ? "results" : "error",
      error: CAPTURE_ERROR.permissionDenied,
    });
    return;
  }
  listenGeneration += 1;
  const generation = listenGeneration;
  awaitingCapture = false;
  setState({
    phase: "listening",
    error: null,
    pageUrl: null,
    pageTitle: null,
  });
  mainWindow?.webContents.send("hotkey:down", { generation, mode: state.mode });
}

function stopListening(): void {
  if (state.phase !== "listening") {
    return;
  }
  // Stay on "listening" until the renderer submits audio or a capture error.
  // That way mute/silence can be shown before STT, and a warning shown while
  // holding is not wiped by a premature "Transcribing" state.
  awaitingCapture = true;
  mainWindow?.webContents.send("hotkey:up", { generation: listenGeneration });
}

function cancelListening(): void {
  listenGeneration += 1;
  awaitingCapture = false;
  hold?.cancel();
  mainWindow?.webContents.send("hotkey:cancel");
  if (pageView.isOpen() || state.phase === "page" || state.phase === "opening") {
    closePage();
    return;
  }
  setState({
    phase: state.results.length > 0 ? "results" : "idle",
    error: null,
  });
}

async function handleAudio(payload: AudioPayload & { generation?: number }): Promise<void> {
  if (payload.generation != null && payload.generation !== listenGeneration) {
    return;
  }
  awaitingCapture = false;
  const captureError = messageForCapturePayload(payload);
  if (captureError) {
    console.info("[poppy:capture]", payload.error ?? "missing-data", "generation", payload.generation);
    setState({
      phase: state.results.length > 0 ? "results" : "error",
      error: captureError,
    });
    return;
  }

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    setState({
      phase: "error",
      apiKeyConfigured: false,
      error: "Missing OPENROUTER_API_KEY. Copy .env.example to .env and add your key.",
    });
    return;
  }

  setState({ phase: "transcribing", error: null, apiKeyConfigured: true });

  let transcript: string;
  try {
    transcript = await transcribeAudio(apiKey, payload);
  } catch (error) {
    setState({
      phase: state.results.length > 0 ? "results" : "error",
      error: error instanceof Error ? error.message : "Speech-to-text failed.",
    });
    return;
  }

  setState({ lastTranscript: transcript });

  if (state.mode === "pick" && state.results.length > 0) {
    const index = parseSpokenIndex(transcript, state.results.length);
    if (index != null) {
      await openResult(index);
      return;
    }
  }

  await runSearch(transcript);
}

async function runSearch(query: string): Promise<void> {
  if (pageView.isOpen()) {
    pageView.close();
  }
  setState({
    phase: "searching",
    mode: "query",
    query,
    error: null,
    results: [],
    pageUrl: null,
    pageTitle: null,
  });
  try {
    const results = await searchWeb(query);
    if (results.length === 0) {
      setState({
        phase: "error",
        mode: "query",
        results: [],
        error: `No organic results for “${query}”. Try another query.`,
      });
      return;
    }
    setState({
      phase: "results",
      mode: "pick",
      results,
      error: null,
    });
  } catch (error) {
    setState({
      phase: "error",
      mode: "query",
      results: [],
      error: error instanceof Error ? error.message : "Search failed.",
    });
  }
}

async function openResult(index: number): Promise<void> {
  const result = state.results.find((item) => item.index === index);
  const openError = resultOpenError(result, state.results.length);
  if (openError || !result) {
    setState({
      phase: "results",
      error: openError ?? `Say a number from 1 to ${state.results.length || 5}.`,
    });
    return;
  }
  setState({
    phase: "opening",
    error: null,
    pageUrl: result.url,
    pageTitle: result.title,
  });
  try {
    await pageView.show(result.url);
    if (state.phase !== "opening" || !pageView.isOpen()) {
      return;
    }
    setState({ phase: "page", mode: "pick", error: null });
  } catch (error) {
    if (state.phase !== "opening") {
      return;
    }
    closePage({
      error: error instanceof Error && error.message ? error.message : "Could not load that page.",
    });
  }
}

function allowMediaPermission(permission: string): boolean {
  return permission === "media" || permission === "audioCapture" || permission === "mediaKeySystem";
}

function microphoneAccessDenied(): boolean {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return false;
  }
  try {
    return systemPreferences.getMediaAccessStatus("microphone") === "denied";
  } catch {
    return false;
  }
}

async function requestMicrophoneAccess(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status !== "granted") {
      await systemPreferences.askForMediaAccess("microphone");
    }
  } catch {
    /* unsupported */
  }
}

function registerHotkey(): void {
  hold = createHoldHotkey({
    accelerator,
    getWindow: () => mainWindow,
    canStart: () => !busyPhase(),
    onPress: startListening,
    onRelease: stopListening,
  });
  const ok = hold.register();
  if (!ok) {
    setState({
      error: `Could not register ${state.hotkeyLabel}. Set POPPY_HOTKEY to a free accelerator.`,
      phase: state.apiKeyConfigured ? "error" : state.phase,
    });
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "copy" }, { role: "selectAll" }] },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        {
          label: "Show Poppy",
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          },
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
  ];
  if (process.platform !== "darwin") {
    template.splice(0, 1);
    template.push({
      label: "File",
      submenu: [{ role: "quit" }],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  loadEnv(app.getAppPath());
  state.apiKeyConfigured = Boolean(getOpenRouterApiKey());
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowMediaPermission(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    allowMediaPermission(permission),
  );

  await requestMicrophoneAccess();

  if (!state.apiKeyConfigured) {
    state.phase = "error";
    state.error = "Missing OPENROUTER_API_KEY. Copy .env.example to .env and add your key.";
  }

  attachIpc();
  buildMenu();
  mainWindow = createWindow();
  registerHotkey();

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    } else {
      mainWindow = createWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  hold?.unregister();
  pageView.close();
  disposeScraper();
});

app.on("will-quit", () => {
  hold?.unregister();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
