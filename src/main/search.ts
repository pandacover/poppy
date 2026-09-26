import { BrowserWindow } from "electron";
import { parseDdgHtml } from "../shared/parse-ddg";
import type { SearchResult } from "../shared/types";

/**
 * Search backend for this first slice: scrape DuckDuckGo HTML
 * (`https://html.duckduckgo.com/html/?q=...`) from a hidden BrowserWindow.
 *
 * This layer is intentionally isolated so it can later swap to Brave Search,
 * Bing Web Search API, or a self-hosted SearXNG instance without changing
 * the rest of the app. Do not scrape Google.
 */

let scraper: BrowserWindow | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getScraper(): BrowserWindow {
  if (scraper && !scraper.isDestroyed()) {
    return scraper;
  }
  scraper = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      images: false,
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
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  await loadUrl(win, url);
  const html = (await win.webContents.executeJavaScript(
    "document.documentElement.outerHTML",
    true,
  )) as string;
  return parseDdgHtml(html);
}

function loadUrl(win: BrowserWindow, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Search timed out. Try again."));
    }, 15_000);

    const onFinish = () => {
      cleanup();
      resolve();
    };
    const onFail = (
      _event: Electron.Event,
      _code: number,
      description: string,
      _failedUrl: string,
      isMainFrame: boolean,
    ) => {
      if (!isMainFrame) {
        return;
      }
      cleanup();
      reject(new Error(`Search page failed to load (${description}).`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      win.webContents.removeListener("did-finish-load", onFinish);
      win.webContents.removeListener("did-fail-load", onFail);
    };

    win.webContents.once("did-finish-load", onFinish);
    win.webContents.on("did-fail-load", onFail);
    void win.loadURL(url, {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    });
  });
}

export function disposeScraper(): void {
  if (scraper && !scraper.isDestroyed()) {
    scraper.destroy();
  }
  scraper = null;
}
