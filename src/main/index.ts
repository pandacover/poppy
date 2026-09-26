import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session,
  shell,
  systemPreferences,
} from "electron";
import { join } from "node:path";
import { getHotkeyAccelerator, getOpenRouterApiKey, loadEnv } from "./env";
import { createHoldHotkey } from "./hotkey";
import { disposeScraper, searchWeb } from "./search";
import { transcribeAudio } from "./stt";
import { formatHotkeyLabel } from "../shared/hotkey";
import { parseSpokenIndex } from "../shared/parse-number";
import type { AppState, AudioPayload } from "../shared/types";

loadEnv(process.cwd());
app.setName("Poppy");
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let listenGeneration = 0;
let hold: ReturnType<typeof createHoldHotkey> | null = null;

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
};

function sendState(): void {
  mainWindow?.webContents.send("state:update", { ...state, results: [...state.results] });
}

function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  sendState();
}

function busyPhase(): boolean {
  return state.phase === "transcribing" || state.phase === "searching" || state.phase === "opening";
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 580,
    minWidth: 380,
    minHeight: 320,
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
  ipcMain.handle("mic:error", (_event, message: string) => {
    hold?.cancel();
    setState({
      phase: state.results.length > 0 ? "results" : "error",
      error: message || "Microphone permission was denied.",
    });
  });
}

function startListening(): void {
  listenGeneration += 1;
  const generation = listenGeneration;
  setState({
    phase: "listening",
    error: null,
  });
  mainWindow?.webContents.send("hotkey:down", { generation, mode: state.mode });
}

function stopListening(): void {
  if (state.phase !== "listening") {
    return;
  }
  setState({ phase: "transcribing", error: null });
  mainWindow?.webContents.send("hotkey:up", { generation: listenGeneration });
}

function cancelListening(): void {
  listenGeneration += 1;
  hold?.cancel();
  mainWindow?.webContents.send("hotkey:cancel");
  setState({
    phase: state.results.length > 0 ? "results" : "idle",
    error: null,
  });
}

async function handleAudio(payload: AudioPayload & { generation?: number }): Promise<void> {
  if (payload.generation != null && payload.generation !== listenGeneration) {
    return;
  }
  if (!payload?.data) {
    setState({
      phase: state.results.length > 0 ? "results" : "idle",
      error: "Didn't catch that. Hold the hotkey and try again.",
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
  setState({
    phase: "searching",
    mode: "query",
    query,
    error: null,
    results: [],
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
  if (!result) {
    setState({
      phase: "results",
      error: `Say a number from 1 to ${state.results.length || 5}.`,
    });
    return;
  }
  if (!/^https?:/i.test(result.url)) {
    setState({ phase: "results", error: "That result has an unsafe URL." });
    return;
  }
  setState({ phase: "opening", error: null });
  try {
    await shell.openExternal(result.url);
    setState({ phase: "results", mode: "pick" });
  } catch {
    setState({
      phase: "results",
      error: "Could not open that link in your browser.",
    });
  }
}

function allowMediaPermission(permission: string): boolean {
  return permission === "media" || permission === "audioCapture" || permission === "mediaKeySystem";
}

async function requestMicrophoneAccess(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status !== "granted") {
    await systemPreferences.askForMediaAccess("microphone");
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
