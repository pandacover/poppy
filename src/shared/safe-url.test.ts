import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeHttpUrl, resultOpenError } from "./safe-url";

describe("isSafeHttpUrl", () => {
  it("accepts http and https URLs", () => {
    assert.equal(isSafeHttpUrl("https://example.com"), true);
    assert.equal(isSafeHttpUrl("http://example.com/path?q=1"), true);
    assert.equal(isSafeHttpUrl("HTTPS://EXAMPLE.COM:443/x"), true);
  });

  it("rejects non-http schemes and junk", () => {
    assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
    assert.equal(isSafeHttpUrl("file:///etc/passwd"), false);
    assert.equal(isSafeHttpUrl("data:text/html,hi"), false);
    assert.equal(isSafeHttpUrl("ftp://example.com"), false);
    assert.equal(isSafeHttpUrl("about:blank"), false);
    assert.equal(isSafeHttpUrl("/relative"), false);
    assert.equal(isSafeHttpUrl(""), false);
    assert.equal(isSafeHttpUrl("not a url"), false);
  });
});

describe("resultOpenError", () => {
  it("asks for a spoken index when the row is missing", () => {
    assert.equal(resultOpenError(undefined, 5), "Say a number from 1 to 5.");
    assert.equal(resultOpenError(undefined, 0), "Say a number from 1 to 5.");
  });

  it("rejects unsafe URLs with the existing guard copy", () => {
    assert.equal(
      resultOpenError({ url: "javascript:alert(1)" }, 3),
      "That result has an unsafe URL.",
    );
    assert.equal(resultOpenError({ url: "https://example.com/a" }, 3), null);
  });
});
