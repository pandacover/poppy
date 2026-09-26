import { contextBridge, ipcRenderer } from "electron";
import type { AppState, AudioPayload } from "../shared/types";

contextBridge.exposeInMainWorld("poppy", {
  getState: (): Promise<AppState> => ipcRenderer.invoke("state:get"),
  onState: (callback: (state: AppState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, next: AppState) => callback(next);
    ipcRenderer.on("state:update", listener);
    return () => {
      ipcRenderer.removeListener("state:update", listener);
    };
  },
  onHotkeyDown: (callback: (payload: { generation: number }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { generation: number },
    ) => callback(payload);
    ipcRenderer.on("hotkey:down", listener);
    return () => ipcRenderer.removeListener("hotkey:down", listener);
  },
  onHotkeyUp: (callback: (payload: { generation: number }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { generation: number },
    ) => callback(payload);
    ipcRenderer.on("hotkey:up", listener);
    return () => ipcRenderer.removeListener("hotkey:up", listener);
  },
  onHotkeyCancel: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("hotkey:cancel", listener);
    return () => ipcRenderer.removeListener("hotkey:cancel", listener);
  },
  submitAudio: (payload: AudioPayload & { generation: number }) =>
    ipcRenderer.invoke("audio:submit", payload),
  openResult: (index: number) => ipcRenderer.invoke("results:open", index),
  closePage: () => ipcRenderer.invoke("page:close"),
  layoutPageView: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke("page:slot", bounds),
  notifyKeyUp: (input: { key?: string; code?: string }) =>
    ipcRenderer.invoke("hotkey:keyup", input),
  cancelListen: () => ipcRenderer.invoke("listen:cancel"),
  reportMicError: (message: string) => ipcRenderer.invoke("mic:error", message),
  reportMicWarning: (message: string) => ipcRenderer.invoke("mic:warn", message),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hide: () => ipcRenderer.invoke("window:hide"),
  fitWindow: (size: { width: number; height: number }) =>
    ipcRenderer.invoke("window:fit", size),
});
