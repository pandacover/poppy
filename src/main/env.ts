import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_HOTKEY } from "../shared/types";

export function loadEnv(appPath: string): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(appPath, ".env"),
    resolve(appPath, "../.env"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      config({ path: file, override: false });
    }
  }
}

export function getOpenRouterApiKey(): string | undefined {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key ? key : undefined;
}

export function getHotkeyAccelerator(): string {
  const fromEnv = process.env.POPPY_HOTKEY?.trim();
  return fromEnv || DEFAULT_HOTKEY;
}
