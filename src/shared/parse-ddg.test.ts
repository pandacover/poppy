import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  classifyDdgPage,
  ddgInterstitialError,
  parseDdgHtml,
  unwrapDdgUrl,
} from "./parse-ddg";

const serp = readFileSync(join(process.cwd(), "test/fixtures/ddg-serp.html"), "utf8");
const bot = readFileSync(join(process.cwd(), "test/fixtures/ddg-bot.html"), "utf8");
const empty = readFileSync(join(process.cwd(), "test/fixtures/ddg-empty.html"), "utf8");

describe("parseDdgHtml", () => {
  it("returns the top 5 organic results and skips ads", () => {
    const results = parseDdgHtml(serp, 5);
    assert.equal(results.length, 5);
    assert.equal(results[0]?.title, "Electron");
    assert.equal(results[0]?.url, "https://www.electronjs.org/");
    assert.match(results[0]?.snippet ?? "", /desktop apps/i);
    assert.deepEqual(
      results.map((result) => result.url),
      [
        "https://www.electronjs.org/",
        "https://github.com/electron/electron",
        "https://en.wikipedia.org/wiki/Electron_(software_framework)",
        "https://www.npmjs.com/package/electron",
        "https://www.howtogeek.com/electron",
      ],
    );
    assert.ok(results.every((result, index) => result.index === index + 1));
    assert.ok(results.every((result) => !/sponsored|hosting|course/i.test(result.title)));
  });

  it("returns an empty list when there are no organic hits", () => {
    assert.deepEqual(parseDdgHtml("<html><body>no results</body></html>"), []);
    assert.deepEqual(parseDdgHtml(empty), []);
  });
});

describe("unwrapDdgUrl", () => {
  it("unwraps /l/?uddg= redirectors", () => {
    assert.equal(
      unwrapDdgUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Felectron%2Felectron&rut=abc"),
      "https://github.com/electron/electron",
    );
    assert.equal(
      unwrapDdgUrl("/l/?uddg=https%3A%2F%2Fwww.rust-lang.org%2F"),
      "https://www.rust-lang.org/",
    );
  });

  it("rejects DuckDuckGo internals, ads, and non-http URLs", () => {
    assert.equal(unwrapDdgUrl("https://duckduckgo.com/settings"), null);
    assert.equal(unwrapDdgUrl("https://html.duckduckgo.com/html/?q=electron"), null);
    assert.equal(unwrapDdgUrl("//duckduckgo.com/y.js?ad=1"), null);
    assert.equal(unwrapDdgUrl("javascript:alert(1)"), null);
  });

  it("keeps absolute third-party URLs", () => {
    assert.equal(unwrapDdgUrl("https://www.electronjs.org/"), "https://www.electronjs.org/");
    assert.equal(unwrapDdgUrl("//exemplo.com/pagina"), "https://exemplo.com/pagina");
  });
});

describe("classifyDdgPage", () => {
  it("detects bot / anomaly challenges", () => {
    assert.equal(classifyDdgPage("https://html.duckduckgo.com/html/?q=electron", bot), "bot");
    assert.match(ddgInterstitialError("bot") ?? "", /bot check/i);
  });

  it("detects an empty results page", () => {
    assert.equal(classifyDdgPage("https://html.duckduckgo.com/html/?q=zzzzz", empty), "empty");
    assert.equal(ddgInterstitialError("empty"), null);
  });

  it("treats a normal HTML SERP as results", () => {
    assert.equal(classifyDdgPage("https://html.duckduckgo.com/html/?q=electron", serp), "results");
    assert.equal(ddgInterstitialError("results"), null);
  });
});
