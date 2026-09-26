import * as cheerio from "cheerio";
import type { SearchResult } from "./types";
import { MAX_RESULTS } from "./types";

export type DdgPageKind = "results" | "bot" | "empty" | "unknown";

const RESULT_SEL = "div.result, div.web-result";
const TITLE_SEL = "a.result__a, .result__title a";
const SNIPPET_SEL = "a.result__snippet, .result__snippet";

/**
 * Classify a loaded DuckDuckGo HTML page so callers can fail clearly on
 * bot checks instead of waiting forever or returning leftover chrome.
 */
export function classifyDdgPage(
  pageUrl: string,
  html: string,
  innerText = "",
): DdgPageKind {
  const url = pageUrl.toLowerCase();
  const text = `${innerText}\n${stripTags(html)}`.toLowerCase();

  if (
    url.includes("anomaly") ||
    html.includes("anomaly-modal") ||
    html.includes("anomaly.js") ||
    text.includes("bots use duckduckgo too") ||
    text.includes("select all squares containing a duck") ||
    (text.includes("complete the following challenge") && text.includes("duckduckgo"))
  ) {
    return "bot";
  }

  const hasOrganicMarkup =
    /class=["'][^"']*result__a\b/.test(html) ||
    /class=["'][^"']*\b(web-result|results_links)\b/.test(html);

  if (
    /id=["']no-results["']/.test(html) ||
    /class=["'][^"']*no-results/.test(html) ||
    (/\bno results\b/.test(text) && !hasOrganicMarkup)
  ) {
    return "empty";
  }

  if (hasOrganicMarkup || /id=["']links["']/.test(html)) {
    return "results";
  }

  return "unknown";
}

export function ddgInterstitialError(kind: DdgPageKind): string | null {
  if (kind === "bot") {
    return "DuckDuckGo is showing a bot check. Poppy can't complete that puzzle — wait a moment and try again.";
  }
  return null;
}

/**
 * Parse organic web results from DuckDuckGo's no-JS HTML SERP
 * (`html.duckduckgo.com/html/`). Ads / sponsored blocks are skipped.
 * `/l/?uddg=` redirectors are unwrapped.
 */
export function parseDdgHtml(html: string, limit = MAX_RESULTS): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  $(RESULT_SEL).each((_, element) => {
    if (results.length >= limit) {
      return;
    }
    const block = $(element);
    if (isAdBlock($, block)) {
      return;
    }

    const anchor = block.find(TITLE_SEL).first();
    if (!anchor.length) {
      return;
    }

    const href = anchor.attr("href") ?? "";
    const url = unwrapDdgUrl(href);
    if (!url || seen.has(url)) {
      return;
    }

    const title = normalizeText(anchor.text());
    if (!title || isBoilerplateTitle(title)) {
      return;
    }

    seen.add(url);
    results.push({
      index: results.length + 1,
      title,
      url,
      snippet: extractSnippet(block, title),
    });
  });

  return results;
}

export function unwrapDdgUrl(href: string): string | null {
  if (!href) {
    return null;
  }
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(absolute, "https://html.duckduckgo.com");
    const nested = parsed.searchParams.get("uddg") || parsed.searchParams.get("u");
    if (nested && isDdgHost(parsed.hostname) && isDdgRedirectPath(parsed.pathname)) {
      return sanitizeHttpUrl(nested);
    }
    if (isDdgHost(parsed.hostname)) {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return sanitizeHttpUrl(parsed.href);
  } catch {
    return null;
  }
}

function isDdgHost(hostname: string): boolean {
  return (
    hostname === "duckduckgo.com" ||
    hostname === "www.duckduckgo.com" ||
    hostname === "html.duckduckgo.com" ||
    hostname === "lite.duckduckgo.com" ||
    hostname.endsWith(".duckduckgo.com")
  );
}

function isDdgRedirectPath(pathname: string): boolean {
  const trimmed = pathname.replace(/\/$/, "") || "/";
  return trimmed === "/l" || trimmed.endsWith("/l");
}

function isAdBlock(
  $: cheerio.CheerioAPI,
  block: ReturnType<cheerio.CheerioAPI>,
): boolean {
  const className = `${block.attr("class") || ""}`.toLowerCase();
  if (/\b(result--ad|badge--ad)\b/.test(className)) {
    return true;
  }
  if ((block.attr("data-nrn") || "").toLowerCase() === "ad") {
    return true;
  }
  if (block.find(".result--ad, .badge--ad, [data-nrn='ad']").length > 0) {
    return true;
  }

  const href = block.find(TITLE_SEL).first().attr("href") || "";
  if (/duckduckgo\.com\/y\.js/i.test(href) || /[?&]ad_domain=/i.test(href)) {
    return true;
  }

  let sponsored = false;
  block.find("span, em, a, div").each((_, el) => {
    const value = normalizeText($(el).text());
    if (/^(ad|ads|sponsored)$/i.test(value)) {
      sponsored = true;
      return false;
    }
    return undefined;
  });
  return sponsored;
}

function isBoilerplateTitle(title: string): boolean {
  return /^(more results|all regions|images|videos|news|maps)$/i.test(title);
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
    if (isDdgHost(url.hostname) && /\/y\.js/i.test(url.pathname)) {
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
