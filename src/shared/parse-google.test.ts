import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  classifyGooglePage,
  googleInterstitialError,
  parseGoogleHtml,
  unwrapGoogleUrl,
} from "./parse-google";

const serp = readFileSync(join(process.cwd(), "test/fixtures/google-serp.html"), "utf8");
const sorry = readFileSync(join(process.cwd(), "test/fixtures/google-sorry.html"), "utf8");
const consent = readFileSync(join(process.cwd(), "test/fixtures/google-consent.html"), "utf8");

describe("parseGoogleHtml", () => {
  it("returns the top 5 organic results and skips ads", () => {
    const results = parseGoogleHtml(serp, 5);
    assert.equal(results.length, 5);
    assert.equal(results[0].title, "Electron");
    assert.equal(results[0].url, "https://www.electronjs.org/");
    assert.match(results[0].snippet, /desktop apps/i);
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
    assert.ok(results.every((result) => !/sponsored|hosting/i.test(result.title)));
  });

  it("returns an empty list when there are no organic hits", () => {
    assert.deepEqual(parseGoogleHtml("<html><body>no results</body></html>"), []);
  });
});

describe("unwrapGoogleUrl", () => {
  it("unwraps /url?q= redirectors", () => {
    assert.equal(
      unwrapGoogleUrl("/url?q=https%3A%2F%2Fgithub.com%2Felectron%2Felectron&sa=U"),
      "https://github.com/electron/electron",
    );
  });

  it("rejects Google internals and non-http URLs", () => {
    assert.equal(unwrapGoogleUrl("https://www.google.com/search?q=electron"), null);
    assert.equal(unwrapGoogleUrl("javascript:alert(1)"), null);
    assert.equal(unwrapGoogleUrl("/aclk?sa=L&adurl=https://ads.example.com"), null);
  });
});

describe("classifyGooglePage", () => {
  it("detects captcha / unusual-traffic pages", () => {
    assert.equal(
      classifyGooglePage("https://www.google.com/sorry/index?continue=/search", sorry),
      "captcha",
    );
    assert.match(googleInterstitialError("captcha") ?? "", /CAPTCHA/i);
  });

  it("detects cookie consent interstitials", () => {
    assert.equal(
      classifyGooglePage("https://consent.google.com/ml?continue=https://www.google.com/search", consent),
      "consent",
    );
    assert.match(googleInterstitialError("consent") ?? "", /consent/i);
  });

  it("treats a normal SERP as results", () => {
    assert.equal(classifyGooglePage("https://www.google.com/search?q=electron", serp), "results");
    assert.equal(googleInterstitialError("results"), null);
  });
});
