import { BrowserWindow, globalShortcut } from "electron";
import { isPrimaryKey, parseAccelerator } from "../shared/hotkey";
import { MAX_LISTEN_MS } from "../shared/types";

interface HoldHotkeyOptions {
  accelerator: string;
  getWindow: () => BrowserWindow | null;
  canStart?: () => boolean;
  onPress: () => void;
  onRelease: () => void;
}

/**
 * Hold-to-speak using Electron's globalShortcut.
 *
 * Chrome's global shortcut API only reports key-down. To get a release, we
 * unregister the shortcut immediately after press (so the OS stops swallowing
 * the key) and listen for the primary key's keyup on the focused window.
 */
export function createHoldHotkey(options: HoldHotkeyOptions) {
  const primary = parseAccelerator(options.accelerator).key;
  let holding = false;
  let safetyTimer: NodeJS.Timeout | null = null;
  let inputHandler:
    | ((event: Electron.Event, input: Electron.Input) => void)
    | null = null;

  const clearSafety = () => {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  const detachKeyup = (win: BrowserWindow | null) => {
    if (win && !win.isDestroyed() && inputHandler) {
      win.webContents.removeListener("before-input-event", inputHandler);
    }
    inputHandler = null;
  };

  const finishRelease = () => {
    if (!holding) {
      return;
    }
    holding = false;
    clearSafety();
    detachKeyup(options.getWindow());
    options.onRelease();
    register();
  };

  const attachKeyup = (win: BrowserWindow) => {
    detachKeyup(win);
    inputHandler = (_event, input) => {
      if (!holding || input.type !== "keyUp") {
        return;
      }
      if (isPrimaryKey(input, primary)) {
        finishRelease();
      }
    };
    win.webContents.on("before-input-event", inputHandler);
  };

  const register = (): boolean => {
    globalShortcut.unregister(options.accelerator);
    return globalShortcut.register(options.accelerator, () => {
      if (holding) {
        return;
      }
      if (options.canStart && !options.canStart()) {
        return;
      }
      holding = true;
      globalShortcut.unregister(options.accelerator);
      const win = options.getWindow();
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) {
          win.restore();
        }
        win.show();
        win.focus();
        attachKeyup(win);
      }
      options.onPress();
      safetyTimer = setTimeout(() => {
        finishRelease();
      }, MAX_LISTEN_MS);
    });
  };

  return {
    register,
    unregister() {
      clearSafety();
      detachKeyup(options.getWindow());
      holding = false;
      globalShortcut.unregister(options.accelerator);
    },
    notifyPossibleRelease(input: { key?: string; code?: string }) {
      if (holding && isPrimaryKey(input, primary)) {
        finishRelease();
      }
    },
    isHolding: () => holding,
    cancel() {
      if (!holding) {
        return;
      }
      holding = false;
      clearSafety();
      detachKeyup(options.getWindow());
      register();
    },
  };
}
