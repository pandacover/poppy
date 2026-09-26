import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHotkeyLabel, isPrimaryKey, parseAccelerator } from "./hotkey";

describe("parseAccelerator", () => {
  it("splits modifiers from the primary key", () => {
    assert.deepEqual(parseAccelerator("CommandOrControl+Shift+Space"), {
      key: "Space",
      modifiers: ["CommandOrControl", "Shift"],
    });
  });
});

describe("formatHotkeyLabel", () => {
  it("uses Ctrl on non-mac platforms", () => {
    assert.equal(
      formatHotkeyLabel("CommandOrControl+Shift+Space", "linux"),
      "Ctrl+Shift+Space",
    );
  });

  it("uses symbols on macOS", () => {
    assert.equal(
      formatHotkeyLabel("CommandOrControl+Shift+Space", "darwin"),
      "⌘⇧Space",
    );
  });
});

describe("isPrimaryKey", () => {
  it("matches space from DOM key or code", () => {
    assert.equal(isPrimaryKey({ key: " ", code: "Space" }, "Space"), true);
    assert.equal(isPrimaryKey({ key: "a", code: "KeyA" }, "Space"), false);
    assert.equal(isPrimaryKey({ key: "p", code: "KeyP" }, "P"), true);
  });
});
