import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ERR_ABORTED, isTransientErrorCode, isTransientLoadError } from "./load-error";

describe("isTransientErrorCode", () => {
  it("treats Chromium abort as transient", () => {
    assert.equal(isTransientErrorCode(ERR_ABORTED), true);
    assert.equal(isTransientErrorCode(-2), false);
    assert.equal(isTransientErrorCode(-105), false);
    assert.equal(isTransientErrorCode(-6), false);
  });
});

describe("isTransientLoadError", () => {
  it("recognizes Electron loadURL abort shapes", () => {
    const electron = Object.assign(new Error("ERR_ABORTED (-3) loading 'https://example.com/'"), {
      errno: -3,
      code: "ERR_ABORTED",
      url: "https://example.com/",
    });
    assert.equal(isTransientLoadError(electron), true);
    assert.equal(isTransientLoadError({ errno: ERR_ABORTED, message: "aborted" }), true);
    assert.equal(isTransientLoadError({ code: "ERR_ABORTED" }), true);
    assert.equal(isTransientLoadError({ code: -3 }), true);
    assert.equal(isTransientLoadError("ERR_ABORTED (-3) loading 'https://a.test/'"), true);
  });

  it("does not treat real network failures as transient", () => {
    const dns = Object.assign(new Error("ERR_NAME_NOT_RESOLVED (-105) loading 'https://nope.test/'"), {
      errno: -105,
      code: "ERR_NAME_NOT_RESOLVED",
    });
    assert.equal(isTransientLoadError(dns), false);
    assert.equal(
      isTransientLoadError({ errno: -2, code: "ERR_FAILED", message: "ERR_FAILED (-2) loading 'https://x'" }),
      false,
    );
    assert.equal(isTransientLoadError(new Error("Could not load that page.")), false);
    assert.equal(isTransientLoadError(null), false);
  });
});
