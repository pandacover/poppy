import * as cheerio from "cheerio";
import type { SearchResult } from "./types";
import { MAX_RESULTS } from "./types";

const AD_CLASS_HINTS = [
  "result--ad",
  "badge--ad",
  "result--sponsored",
  "sponsored",
];

/**
 * Parse organic results from DuckDuckGo's HTML endpoint.
 * Ads / sponsored blocks are dropped. Destinations are unwrapped from
 * DDG's `/l/?uddg=` redirector.
 */
export function parseDdgHtml(
  html: string,
  limit = MAX_RESULTS,
): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, element) => {
    if (results.length >= limit) {
      return;
    }

    const node = $(element);
    const className = (node.attr("class") ?? "").toLowerCase();
    if (className.includes("result--more") || className.includes("result--no-result")) {
      return;
    }
    if (!className.includes("web-result") && node.find("a.result__a").length === 0) {
      return;
    }
    if (looksLikeAd(node, className)) {
      return;
    }

    const link = node.find("a.result__a").first();
    const href = link.attr("href") ?? "";
    if (isAdUrl(href)) {
      return;
    }

    const url = unwrapDdgUrl(href);
    if (!url) {
      return;
    }

    const title = normalizeText(link.text());
    if (!title) {
      return;
    }

    const snippet = normalizeText(node.find(".result__snippet").first().text());
    results.push({
      index: results.length + 1,
      title,
      url,
      snippet,
    });
  });

  return results;
}

function looksLikeAd(
  node: { find: (selector: string) => { length: number; first: () => { text: () => string } } },
  className: string,
): boolean {
  if (AD_CLASS_HINTS.some((hint) => className.includes(hint))) {
    return true;
  }
  if (node.find(".badge--ad, .result__badge--ad, [data-testid='ad']").length > 0) {
    return true;
  }
  const label = normalizeText(node.find(".badge, .result__badge").first().text()).toLowerCase();
  return label.includes("ad") || label.includes("sponsored");
}

function isAdUrl(href: string): boolean {
  return /\/y\.js(\?|$)/i.test(href) || /[?&]ad_provider=/i.test(href);
}

export function unwrapDdgUrl(href: string): string | null {
  if (!href) {
    return null;
  }
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(absolute, "https://html.duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      return sanitizeHttpUrl(uddg);
    }
    if (parsed.hostname.endsWith("duckduckgo.com")) {
      return null;
    }
    return sanitizeHttpUrl(parsed.href);
  } catch {
    return null;
  }
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
