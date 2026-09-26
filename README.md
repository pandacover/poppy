# Poppy

Hold a hotkey, speak a search, pick a result by saying its number.

Poppy is a small Electron launcher: it listens while you hold a global shortcut, transcribes with OpenRouter Whisper, shows the top 5 organic Google results, then opens the one you speak.

## Requirements

- **Node.js 20+** (Node 22 is what we develop against; see `.nvmrc`)
- An [OpenRouter API key](https://openrouter.ai/keys)
- A microphone, and OS permission for this app to use it

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set:

```
OPENROUTER_API_KEY=sk-or-...
```

The key is read only in the Electron **main** process. It is never shipped to the renderer.

## Run

```bash
npm run dev
```

`npm start` does the same (build, then launch). `npm test` runs parser unit tests. `npm run build` compiles to `dist/` without launching.

Hold **Ctrl+Shift+Space** (⌘⇧Space on macOS), speak a query, release. After results appear, hold the same shortcut and say `3`, `three`, or `number three` to open that row in your default browser. You can also click a row or press `1`–`5` while the window is focused.

Hide the window with the title-bar button or Escape; the app stays running so the hotkey still works. Quit from the menu (`Ctrl+Q` / `Cmd+Q`).

## Hotkey

Default accelerator: `CommandOrControl+Shift+Space`.

To change it, set `POPPY_HOTKEY` in `.env` using [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator) syntax:

```
POPPY_HOTKEY=CommandOrControl+Alt+P
```

If the default combo is taken by the OS or another app, registration fails and Poppy shows an error — pick another combo.

Hold-to-speak: the shortcut starts capture on key-down. Poppy then unregisters it so the key-up can be seen, and stops capture when you release the primary key (or after 15 seconds).

## Speech-to-text

Audio is recorded in the renderer, sent to main as base64, and posted to:

`POST https://openrouter.ai/api/v1/audio/transcriptions`

with model `openai/whisper-large-v3-turbo` and `input_audio: { data, format }`.

## Search

Poppy does **not** call the Google Search API. It loads Google's public results page in a hidden Chromium `BrowserWindow`:

`https://www.google.com/search?q=...&hl=en&pws=0&gbv=1`

(`gbv=1` asks for the HTML-oriented results view. Google may still serve the full JavaScript SERP; extraction runs against the rendered DOM either way.)

After load, Poppy reads organic title / URL / snippet rows from the DOM, drops ads/sponsored blocks as best it can from the markup, and keeps the top 5. Saying a number still opens that URL with `shell.openExternal`.

This scrape can break when:

- Google shows a **CAPTCHA** / “unusual traffic” page
- Google shows a **cookie consent** or other interstitial
- Google changes SERP HTML
- The network looks automated (datacenter IPs are often blocked)

Poppy detects captcha and consent pages and shows a clear error instead of hanging. There is no automatic “Accept all” click-through.

## Layout

```
src/main       main process: hotkey, STT, search, openExternal
src/preload    contextBridge API
src/renderer   UI (listening pill, numbered results)
src/shared     parsers and types (unit-tested)
```

## Troubleshooting

- **Missing key** — copy `.env.example` to `.env` in the project root (the directory you run `npm run dev` from).
- **Mic denied** — grant microphone access to Poppy / Electron in OS settings and try again.
- **STT failure** — check the key, OpenRouter credits, and network; very short holds may not capture enough audio.
- **Google CAPTCHA / consent / empty results** — this is a page scrape, not an API. Try later, from a normal residential network, or after Google stops showing an interstitial.
- **Hotkey does nothing** — another app owns that combo, or the window manager ate it. Set `POPPY_HOTKEY`.
