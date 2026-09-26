export interface ParsedAccelerator {
  key: string;
  modifiers: string[];
}

export function parseAccelerator(accelerator: string): ParsedAccelerator {
  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { key: "", modifiers: [] };
  }
  return { key: parts[parts.length - 1], modifiers: parts.slice(0, -1) };
}

export function formatHotkeyLabel(
  accelerator: string,
  platform: NodeJS.Platform,
): string {
  const { key, modifiers } = parseAccelerator(accelerator);
  const isMac = platform === "darwin";
  const names: Record<string, string> = {
    CommandOrControl: isMac ? "⌘" : "Ctrl",
    Command: "⌘",
    Cmd: "⌘",
    Control: isMac ? "⌃" : "Ctrl",
    Ctrl: isMac ? "⌃" : "Ctrl",
    Alt: isMac ? "⌥" : "Alt",
    Option: "⌥",
    Shift: isMac ? "⇧" : "Shift",
    Super: isMac ? "⌘" : "Super",
    Meta: "⌘",
  };
  const keyLabel = key.toLowerCase() === "space" ? "Space" : key;
  const bits = [...modifiers.map((mod) => names[mod] ?? mod), keyLabel];
  return isMac ? bits.join("") : bits.join("+");
}

export function isPrimaryKey(
  input: { key?: string; code?: string },
  primaryKey: string,
): boolean {
  const expected = primaryKey.toLowerCase();
  const key = (input.key ?? "").toLowerCase();
  const code = (input.code ?? "").toLowerCase();
  if (expected === "space") {
    return key === " " || key === "space" || code === "space";
  }
  if (/^f\d{1,2}$/.test(expected)) {
    return key === expected || code === expected;
  }
  if (expected.length === 1) {
    return key === expected || code === `key${expected}`;
  }
  return key === expected || code === expected || code === `key${expected}`;
}
