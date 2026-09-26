import { BrowserWindow, session } from "electron";
import {
  classifyGooglePage,
  googleInterstitialError,
  parseGoogleHtml,
} from "../shared/parse-google";
import type { SearchResult } from "../shared/types";

/**
 * Search backend: scrape Google's results page from a hidden BrowserWindow
 * using Electron's Chromium. This is NOT the Google Search API.
 *
 * Captchas, cookie consent walls, and HTML changes can break extraction.
 * Those pages are detected and surfaced as errors instead of hanging.
 */

const LOAD_TIMEOUT_MS = 20_000;
const POLL_MS = 350;

let scraper: BrowserWindow | null = null;
let queue: Promise<unknown> = Promise.resolve();

function searchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en",
    pws: "0",
    gbv: "1",
  });
  return `https://www.google.com/search?${params.toString()}`;
}

function getScraper(): BrowserWindow {
  if (scraper && !scraper.isDestroyed()) {
    return scraper;
  }
  scraper = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: session.fromPartition("persist:poppy-google"),
    },
  });
  scraper.webContents.setAudioMuted(true);
  scraper.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return scraper;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const run = queue.then(() => searchOnce(query));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function searchOnce(query: string): Promise<SearchResult[]> {
  const win = getScraper();
  await loadUrl(win, searchUrl(query));
  const snapshot = await waitForPage(win);
  const kind = classifyGooglePage(snapshot.href, snapshot.html, snapshot.text);
  const interstitial = googleInterstitialError(kind);
  if (interstitial) {
    throw new Error(interstitial);
  }

  const results = parseGoogleHtml(snapshot.html);
  if (results.length > 0) {
    return results;
  }

  if (kind === "unknown") {
    throw new Error(
      "Google did not return a usable results page (layout change, block, or empty document).",
    );
  }
  return [];
}

interface PageSnapshot {
  href: string;
  html: string;
  text: string;
}

async function waitForPage(win: BrowserWindow): Promise<PageSnapshot> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  let last: PageSnapshot = { href: "", html: "", text: "" };

  while (Date.now() < deadline) {
    if (win.isDestroyed()) {
      throw new Error("Search window was closed.");
    }
    last = (await win.webContents.executeJavaScript(`({
      href: location.href,
      html: document.documentElement ? document.documentElement.outerHTML : "",
      text: document.body ? document.body.innerText : ""
    })`)) as PageSnapshot;

    const kind = classifyGooglePage(last.href, last.html, last.text);
    if (kind === "captcha" || kind === "consent") {
      return last;
    }
    if (kind === "results" && parseGoogleHtml(last.html).length > 0) {
      return last;
    }
    await sleep(POLL_MS);
  }

  return last;
}

function loadUrl(win: BrowserWindow, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Search timed out. Try again.")));
    }, LOAD_TIMEOUT_MS);

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      win.webContents.removeListener("did-finish-load", onFinish);
      win.webContents.removeListener("did-stop-loading", onFinish);
      win.webContents.removeListener("did-fail-load", onFail);
      action();
    };

    const onFinish = () => finish(() => resolve());
    const onFail = (
      _event: Electron.Event,
      code: number,
      description: string,
      _failedUrl: string,
      isMainFrame: boolean,
    ) => {
      if (!isMainFrame) {
        return;
      }
      if (code === -3) {
        return;
      }
      finish(() => reject(new Error(`Search page failed to load (${description}).`)));
    };

    win.webContents.on("did-finish-load", onFinish);
    win.webContents.on("did-stop-loading", onFinish);
    win.webContents.on("did-fail-load", onFail);
    void win.loadURL(url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("ERR_ABORTED")) {
        finish(() => reject(error instanceof Error ? error : new Error(message)));
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function disposeScraper(): void {
  if (scraper && !scraper.isDestroyed()) {
    scraper.destroy();
  }
  scraper = null;
}
