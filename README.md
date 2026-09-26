# Poppy

Hold a hotkey, speak a search, pick a result by saying its number.

Poppy is a small Electron launcher: it listens while you hold a global shortcut, transcribes with **ElevenLabs Scribe v2 Realtime**, shows the top 5 organic DuckDuckGo results, then opens the one you speak **inside the app**.

## Requirements

- **Node.js 20+** (Node 22 is what we develop against; see `.nvmrc`)
- An [ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys) with access to Scribe realtime speech-to-text
- A microphone, and OS permission for this app to use it (unmuted, and set to a real input — not a monitor/loopback device)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set:

```
ELEVENLABS_API_KEY=sk_...
```

The key is read only in the Electron **main** process. It is never shipped to the renderer.

OpenRouter is **not** used. The previous Whisper Large V3 Turbo path (`OPENROUTER_API_KEY` + `POST /api/v1/audio/transcriptions`) has been removed.

## Run

```bash
npm run dev
```

`npm start` does the same (build, then launch). `npm test` runs unit tests. `npm run build` compiles to `dist/` without launching.

Hold **Ctrl+Shift+Space** (⌘⇧Space on macOS), speak a query, release. After results appear, hold the same shortcut and say `3`, `three`, or `number three` to open that row **inside Poppy**. You can also click a row or press `1`–`5` while the window is focused.

On an open page, **Results** (or Escape) returns to the list. The same hotkey still starts a new search. Hide the window with the title-bar button; the app stays running so the hotkey still works. Quit from the menu (`Ctrl+Q` / `Cmd+Q`).

## Hotkey

Default accelerator: `CommandOrControl+Shift+Space`.

To change it, set `POPPY_HOTKEY` in `.env` using [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator) syntax:

```
POPPY_HOTKEY=CommandOrControl+Alt+P
```

If the default combo is taken by the OS or another app, registration fails and Poppy shows an error — pick another combo.

Hold-to-speak: the shortcut starts capture on key-down. Poppy then unregisters it so the key-up can be seen, and stops capture when you release the primary key (or after 15 seconds). No extra click is required to start the microphone.

## Speech-to-text

The renderer captures PCM from the microphone and **streams 16-bit mono PCM** to the main process while you hold the hotkey. Main connects to ElevenLabs Realtime Speech-to-Text with `@elevenlabs/elevenlabs-js`:

`wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime`

Model: `scribe_v2_realtime`. The ElevenLabs key stays in the main process (`xi-api-key` on that WebSocket). The renderer never sees it.

Partial transcripts update the launcher live. Search does **not** run on every partial.

### Silence before search

ElevenLabs VAD auto-commits after a pause. The API/SDK floor for `vad_silence_threshold_secs` is **0.3s** (range 0.3–3.0), so 250ms cannot be set on the wire. Poppy uses:

1. **VAD commit** at **0.3s** of silence (closest allowed value)
2. A **local 250ms wait on key-up** if there is still uncommitted audio, then a manual commit of the leftover
3. Short holds are padded with silence up to ~2s of audio, because Scribe starts processing after about two seconds of stream

### Search debounce

DuckDuckGo is scraped only after a **settled/committed** query. Rapid commits (including near-duplicates like `cats near me` / `cats near me.`) are debounced for **250ms** and collapsed so one utterance cannot fire several scrapes.

If the mic is muted, permission is denied, or the stream is digital silence, Poppy shows that error **before** opening the ElevenLabs socket (or aborts it if capture fails after streaming started).

## Search

Poppy does **not** call a paid search API. It loads DuckDuckGo’s public HTML results page in a hidden Chromium `BrowserWindow`:

`https://html.duckduckgo.com/html/?q=...&kl=wt-wt`

After load, Poppy reads organic title / URL / snippet rows from the markup, drops ads/sponsored blocks (`result--ad`, `badge--ad`, `data-nrn="ad"`, `y.js` trackers) as best it can, and keeps the top 5.

Picking a result (spoken number, click, or `1`–`5`) loads that URL in an in-app `WebContentsView` (Electron’s BrowserView successor) in the same window — not the system browser. Only `http:` / `https:` URLs are allowed; other schemes show the existing unsafe-URL error. Target=_blank links stay in that view. **Results** or Escape closes the page and restores the launcher.

This scrape can break when:

- DuckDuckGo shows a **bot check** / anomaly puzzle
- DuckDuckGo changes HTML
- The network looks automated (datacenter IPs are often challenged)

Poppy detects bot-check pages and load failures and shows a clear error instead of hanging. There is no automatic puzzle click-through.

Google’s public SERP is **not** the current backend. Google was hitting CAPTCHA / “unusual traffic” in the hidden window; that path was removed rather than left half-working. A Google scrape could be re-added later as an optional backend if needed.

## Layout

The idle launcher is a frameless, transparent window: desktop shows through outside a frosted glass frame, with a solid white search pill inside. After a search, that same glass panel grows downward and lists numbered results as white rounded cards. Opening a result expands into the same glass family — a frosted frame with a Results pill and the page rendered in the inner slot. Wheel, trackpad, and keyboard scrolling work inside that page.

```
src/main       main process: hotkey, STT, search, in-app page view
src/preload    contextBridge API
src/renderer   UI (glass search launcher, numbered results, page toolbar)
src/shared     parsers, audio helpers, and types (unit-tested)
```

## Troubleshooting

- **Missing key** — copy `.env.example` to `.env` in the project root (the directory you run `npm run dev` from) and set `ELEVENLABS_API_KEY`.
- **Mic permission denied** — grant microphone access to Poppy / Electron in OS settings and try again. This is distinct from a muted mic: if permission is already granted, Poppy will not prompt again.
- **Microphone is unavailable / none found** — no input device, or it is exclusive to another app. Plug in a mic or close the other app.
- **Only monitor/loopback inputs** — the OS listed “Monitor of …” / Stereo Mix / loopback, not a real microphone. In system sound settings, pick the physical mic and unmute it.
- **The microphone is muted** — permission was granted, but the capture track is muted (OS mute switch or hardware mute). Unmute and try again. Poppy may warn while you are still holding the hotkey.
- **Microphone is muted or producing silence** — RMS stayed near digital zero while you held. Unmute the mic, or pick a different input — not a monitor or loopback. This is shown during or right after listen, before ElevenLabs.
- **No audio was captured** — the hold ended before Poppy had enough PCM (very short tap, or the recorder had not started). Hold the hotkey until you finish speaking.
- **Empty transcript** — audio reached ElevenLabs but Scribe returned no text. Speak a bit longer and confirm the key has Scribe realtime access. HTTP/key/network failures show their own messages instead of this one.
- **STT network / auth failure** — check `ELEVENLABS_API_KEY`, credits, and connectivity. Main logs `[poppy:stt]` with model and sample rate (never the key or audio).
- **DuckDuckGo bot check / empty results** — this is a page scrape, not an API. Try later, from a normal residential network. There is no Google CAPTCHA path in this build.
- **Could not load that page** — the in-app view failed a real load (DNS, TLS, or the host refused). Cancelled first navigations — expanding the window, attaching `WebContentsView`, or replacing `about:blank` (`ERR_ABORTED` / `-3`) — are retried or ignored and should not show this.
- **Hotkey does nothing** — another app owns that combo, or the window manager ate it. Set `POPPY_HOTKEY`.
