import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTURE_ERROR } from "./capture-errors";
import { classifyGetUserMediaError } from "./media-errors";

describe("classifyGetUserMediaError", () => {
  it("maps permission denial separately from missing hardware", () => {
    assert.equal(
      classifyGetUserMediaError({ name: "NotAllowedError" }).message,
      CAPTURE_ERROR.permissionDenied,
    );
    assert.equal(
      classifyGetUserMediaError({ name: "PermissionDeniedError" }).kind,
      "denied",
    );
    assert.equal(
      classifyGetUserMediaError({ name: "NotFoundError" }).message,
      CAPTURE_ERROR.noMicrophone,
    );
  });

  it("maps in-use / unreadable devices as unavailable, not denied", () => {
    const result = classifyGetUserMediaError({ name: "NotReadableError" });
    assert.equal(result.kind, "unavailable");
    assert.equal(result.message, CAPTURE_ERROR.permissionUnavailable);
    assert.notEqual(result.message, CAPTURE_ERROR.permissionDenied);
  });

  it("falls back to a generic capture failure", () => {
    assert.equal(
      classifyGetUserMediaError(new Error("boom")).message,
      CAPTURE_ERROR.captureFailed,
    );
  });
});
