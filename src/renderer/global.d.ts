import type { AppState, AudioPayload } from "../shared/types";

export interface PoppyApi {
  getState: () => Promise<AppState>;
  onState: (callback: (state: AppState) => void) => () => void;
  onHotkeyDown: (callback: (payload: { generation: number }) => void) => () => void;
  onHotkeyUp: (callback: (payload: { generation: number }) => void) => () => void;
  onHotkeyCancel: (callback: () => void) => () => void;
  submitAudio: (payload: AudioPayload & { generation: number }) => Promise<void>;
  openResult: (index: number) => Promise<void>;
  notifyKeyUp: (input: { key?: string; code?: string }) => Promise<void>;
  cancelListen: () => Promise<void>;
  reportMicError: (message: string) => Promise<void>;
  minimize: () => Promise<void>;
  hide: () => Promise<void>;
}

declare global {
  interface Window {
    poppy: PoppyApi;
  }
}

export {};
