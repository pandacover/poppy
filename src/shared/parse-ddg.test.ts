import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseDdgHtml, unwrapDdgUrl } from "./parse-ddg";

const fixture = readFileSync(join(process.cwd(), "test/fixtures/ddg-mixed.html"), "utf8");

describe("parseDdgHtml", () => {
  it("returns the top 5 organic results and skips ads", () => {
    const results = parseDdgHtml(fixture, 5);
    assert.equal(results.length, 5);
    assert.equal(results[0].title, "Build cross-platform desktop apps | Electron");
    assert.equal(results[0].url, "https://www.electronjs.org/");
    assert.match(results[0].snippet, /desktop apps/i);
    assert.deepEqual(
      results.map((result) => result.url),
      [
        "https://www.electronjs.org/",
        "https://en.wikipedia.org/wiki/Electron_(software_framework)",
        "https://github.com/electron/electron",
        "https://www.npmjs.com/package/electron",
        "https://www.howtogeek.com/electron",
      ],
    );
    assert.ok(results.every((result, index) => result.index === index + 1));
    assert.ok(results.every((result) => !/ad|sponsored/i.test(result.title)));
  });

  it("returns an empty list when there are no organic hits", () => {
    assert.deepEqual(parseDdgHtml("<html><body>no results</body></html>"), []);
  });
});

describe("unwrapDdgUrl", () => {
  it("unwraps the uddg redirect parameter", () => {
    assert.equal(
      unwrapDdgUrl(
        "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.electronjs.org%2F&rut=abc",
      ),
      "https://www.electronjs.org/",
    );
  });

  it("rejects duckduckgo internals and non-http URLs", () => {
    assert.equal(unwrapDdgUrl("https://duckduckgo.com/html/"), null);
    assert.equal(unwrapDdgUrl("javascript:alert(1)"), null);
  });
});
