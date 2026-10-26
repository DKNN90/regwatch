# RegWatch

A personal, installable web app (PWA) that tracks financial regulatory developments across
**Europe, the United Kingdom, the United States and global standard setters**, in plain English.

- **Latest** — dated updates with what each document says, who it applies to, key dates and sources.
- **Tracker** — the status of major files (PSD3/PSR, AMLR/AMLA, MiCA, GENIUS Act, UK crypto regime…).
- **Ahead** — upcoming deadlines, plenaries, consultation closes and go-live dates.

Content lives in `feed.json` and is refreshed every Monday and Thursday by a scheduled
Claude run following `MAINTAINING.md`. The app caches itself and the last feed, so it works offline.

## Install on Android

Open the GitHub Pages URL in Chrome → ⋮ menu → **Install app**.

## Hosting

GitHub Pages, deployed from the `main` branch root.

Summaries are AI-assisted and may contain errors. Not legal advice — always check the primary source.
