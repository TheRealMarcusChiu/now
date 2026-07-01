# Now. — a personal, append-only life log

One dark-gold website (matching marcuschiu.com's writing theme) that shows what
you're doing **right now** and everything you've ever done — fed automatically by
a Chrome extension, an iPhone app, and anything else that can POST JSON.

```
Chrome extension ─┐                        ┌─ index.html  (static site — GitHub Pages or file://)
iPhone app ───────┼→  node server/server.mjs ──appends──→  data/events.jsonl   (canonical, append-only)
scripts/cron ─────┘        │                               data/events.js      (same data, file://-safe)
                           └──writes──→  media/*.jpg|wav|mp4  (photos, voice notes, videos)
```

## Quick start

```bash
node server/server.mjs        # → http://127.0.0.1:8787
```

- **Website** — open `index.html` directly (file:// works) or via the server.
  It ships with a month of sample data; delete `data/events.jsonl` and
  `data/events.js` to start fresh (the server recreates them).
- **Chrome extension** — chrome://extensions → Developer mode → *Load unpacked* →
  the `extension/` folder. It logs active-tab time per site and real YouTube
  watch-seconds. Endpoint configurable in its options page.
- **iPhone app** — see `ios/README.md`. Map + duration of everywhere you've been,
  recency-weighted heatmap, camera sharing with auto date + description.

## Deploy to GitHub Pages

The site is fully static — `index.html` + `support.js` + `data/` + `media/`.

```bash
git init && git add . && git commit -m "first log"
git push  # to <you>.github.io or any repo with Pages enabled
```

To publish new activity, commit and push `data/` + `media/` (a cron job works):

```bash
git add data media && git commit -m "log $(date +%F)" && git push
```

⚠️ **This is your browsing history and location, public.** You chose public —
fine, but remember: append-only means the git history keeps everything forever.

## The append-only log

Canonical file: `data/events.jsonl` — one JSON object per line, never rewritten.
`data/events.js` is the same data as `__logEvent({...})` lines so the site works
over `file://` without fetch/CORS. The server appends to both atomically.
Every event gets `ts` stamped automatically if the sender omits it.

```jsonl
{"ts":"2026-07-01T17:04:11Z","type":"web","domain":"github.com","title":"…","url":"…","secs":840,"source":"chrome"}
{"ts":"2026-07-01T15:30:00Z","type":"place","name":"Ritual Coffee","lat":37.75,"lng":-122.42,"secs":4520,"source":"iphone"}
{"ts":"2026-07-01T12:02:33Z","type":"photo","media":"media/20260701-a1b2c.jpg","caption":"…","source":"iphone-share"}
```

Types the site renders: `web` `youtube` (click-to-play embeds) `music` `git`
`health` `screen` `place` `photo` `audio` `video` `note` — images, videos, and
audio recordings all render inline in the timeline.

## Posting your own events

Anything can append:

```bash
curl -X POST http://127.0.0.1:8787/log -H 'Content-Type: application/json' \
  -d '{"type":"note","title":"Started reading Anathem"}'
```

## Other things worth auto-tracking (easy to add — same POST)

- **Music** — Last.fm/Spotify "now playing" poll → `music` events (schema already supported)
- **Git commits** — a `post-commit` hook: `curl … -d "{\"type\":\"git\",…}"` (supported)
- **Screen time per iPhone app** — iOS Shortcuts automation → POST (supported)
- **Workouts / weight** — extend `HealthSync.swift`; HealthKit exposes both
- **Weather at your location** — cron + any weather API, attach to `place` events
- **Calendar events attended** — `gcalcli` or an ICS parser on cron
- **Podcasts** — Overcast exports listening history
- **Sleep stages, HRV, resting HR** — same HealthKit query pattern
- **Books/reading** — a Shortcuts share-sheet that POSTs a `note` with the title
- **Terminal commands / coding time** — WakaTime or a zsh `precmd` hook, summarized daily

## Files

- `Now.dc.html` / `index.html` — the website (single page; hero, timeline, day rail, map + heatmap)
- `server/server.mjs` — zero-dependency Node server (log, upload, static hosting)
- `extension/` — Chrome MV3 extension (site time + YouTube watches)
- `ios/` — SwiftUI sources + setup guide
- `data/` — the append-only log · `media/` — uploaded photos/audio/video
