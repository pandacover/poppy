import * as cheerio from "cheerio";
import type { SearchResult } from "./types";
import { MAX_RESULTS } from "./types";

export type GooglePageKind = "results" | "consent" | "captcha" | "unknown";

const AD_ANCESTOR =
  "#tads, #tadsb, #bottomads, #tvcap, [data-text-ad], .uEierd, .commercial-unit-desktop-top, .cu-container";

const RESULT_BLOCK =
  "div.g, .MjjYud, .xpd, .tF2Cxc, .N54PNb, .Gx5Zad, .Ww4FFb, .hlcw0c";

const SNIPPET_SEL = ".VwiC3b, .IsZvec, .aCOpRe, .st, [data-sncf], .yXK7ld, .ITZIwc";

/**
 * Classify a loaded Google page so callers can fail clearly on
 * captchas / consent walls instead of waiting forever.
 */
export function classifyGooglePage(
  pageUrl: string,
  html: string,
  innerText = "",
): GooglePageKind {
  const url = pageUrl.toLowerCase();
  const text = `${innerText}\n${stripTags(html)}`.toLowerCase();

  if (
    url.includes("/sorry") ||
    url.includes("google.com/sorry") ||
    text.includes("unusual traffic from your computer network") ||
    text.includes("detected unusual traffic") ||
    (text.includes("not a robot") &&
      (html.includes("recaptcha") || html.includes("g-recaptcha") || html.includes("captcha-form")))
  ) {
    return "captcha";
  }

  if (
    url.includes("consent.google.") ||
    url.includes("consent.youtube.") ||
    text.includes("before you continue to google") ||
    /form[^>]+action=["'][^"']*consent\.google/i.test(html)
  ) {
    return "consent";
  }

  if (
    /id=["']rso["']/.test(html) ||
    /id=["']search["']/.test(html) ||
    /class=["'][^"']*\bg\b/.test(html) ||
    (html.includes("<h3") && /google/i.test(html))
  ) {
    return "results";
  }

  return "unknown";
}

export function googleInterstitialError(kind: GooglePageKind): string | null {
  if (kind === "captcha") {
    return "Google is showing a CAPTCHA / unusual-traffic check. Poppy scrapes the results page and can't continue until Google serves a normal SERP.";
  }
  if (kind === "consent") {
    return "Google is showing a cookie consent or interstitial page. Poppy can't accept it automatically — try again later, or Google may be blocking this client.";
  }
  return null;
}

/**
 * Parse organic web results from a rendered Google SERP.
 * Ads / sponsored blocks are skipped. `/url?q=` redirectors are unwrapped.
 */
export function parseGoogleHtml(html: string, limit = MAX_RESULTS): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  $("h3").each((_, element) => {
    if (results.length >= limit) {
      return;
    }
    const h3 = $(element);
    if (h3.parents(AD_ANCESTOR).length > 0) {
      return;
    }

    let anchor = h3.closest("a");
    if (!anchor.length) {
      anchor = h3.find("a").first();
    }
    if (!anchor.length) {
      return;
    }

    const href = anchor.attr("href") ?? "";
    if (isAdHref(href)) {
      return;
    }
    const url = unwrapGoogleUrl(href);
    if (!url || seen.has(url)) {
      return;
    }

    const title = normalizeText(h3.text());
    if (!title || isBoilerplateTitle(title)) {
      return;
    }

    const block = h3.closest(RESULT_BLOCK);
    const scope = block.length ? block : h3.parent();
    if (looksSponsored($, scope)) {
      return;
    }

    seen.add(url);
    results.push({
      index: results.length + 1,
      title,
      url,
      snippet: extractSnippet(scope, title),
    });
  });

  return results;
}

export function unwrapGoogleUrl(href: string): string | null {
  if (!href) {
    return null;
  }
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(absolute, "https://www.google.com");
    const nested =
      parsed.searchParams.get("q") ||
      parsed.searchParams.get("url") ||
      parsed.searchParams.get("u");
    if (
      isGoogleSerpHost(parsed.hostname) &&
      parsed.pathname.replace(/\/$/, "") === "/url" &&
      nested
    ) {
      return sanitizeHttpUrl(nested);
    }
    if (isGoogleSerpHost(parsed.hostname) && isGoogleInternalPath(parsed.pathname)) {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (isGoogleSerpHost(parsed.hostname) && parsed.pathname === "/") {
      return null;
    }
    return sanitizeHttpUrl(parsed.href);
  } catch {
    return null;
  }
}

function isGoogleSerpHost(hostname: string): boolean {
  return (
    hostname === "google.com" ||
    hostname === "www.google.com" ||
    /^www\.google\.[a-z.]+$/.test(hostname)
  );
}

function isGoogleInternalPath(pathname: string): boolean {
  return (
    pathname.startsWith("/search") ||
    pathname.startsWith("/sorry") ||
    pathname.startsWith("/url") ||
    pathname.startsWith("/imgres") ||
    pathname.startsWith("/aclk") ||
    pathname.startsWith("/prefs") ||
    pathname.startsWith("/httpservice")
  );
}

function isAdHref(href: string): boolean {
  return /\/aclk(\?|$)/i.test(href) || /[?&]adurl=/i.test(href) || /doubleclick\.net/i.test(href);
}

function isBoilerplateTitle(title: string): boolean {
  return /^(people also ask|related searches|videos|images|news|shopping|maps|more results)$/i.test(
    title,
  );
}

function looksSponsored(
  $: cheerio.CheerioAPI,
  block: ReturnType<cheerio.CheerioAPI>,
): boolean {
  if (block.parents(AD_ANCESTOR).length > 0) {
    return true;
  }
  let sponsored = false;
  block.find("span, div, em").each((_, el) => {
    const value = normalizeText($(el).text());
    if (/^(sponsored|ad|ads)$/i.test(value)) {
      sponsored = true;
      return false;
    }
    return undefined;
  });
  const aria = (block.attr("aria-label") || "").toLowerCase();
  return sponsored || aria.includes("sponsored") || aria.includes("advertisement");
}

function extractSnippet(block: ReturnType<cheerio.CheerioAPI>, title: string): string {
  const dedicated = normalizeText(block.find(SNIPPET_SEL).first().text());
  if (dedicated && dedicated !== title) {
    return dedicated.slice(0, 280);
  }
  const full = normalizeText(block.text());
  const withoutTitle = full.startsWith(title) ? full.slice(title.length).trim() : full;
  return withoutTitle.slice(0, 280);
}

function sanitizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}
