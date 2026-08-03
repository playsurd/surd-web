# surd

A fast, minimal games portal. The entire site is **one self-contained HTML file, ~15 KB** — no
framework, no dependencies, no backend, no tracking.

## Why one file

The site has to work when it's downloaded and opened from your own disk, not just when it's hosted.
Local files run under `file://`, where `fetch()` of local files and ES-module imports are both blocked
by the browser. So everything — styles, game manifest, app code — is inlined at build time, and the
hosted build and the downloadable build are the exact same artifact.

## Features

- Search, tag filters, favorites, recently played — all stored locally, nothing sent anywhere
- Cover grid, lazy-loaded
- Fullscreen player
- Cloaking: custom tab title, custom favicon, `about:blank` launch
- Panic key (backtick) redirects to a URL of your choice
- Keyboard: `/` search, `Esc` close

## Build

Requires only Node. There is nothing to install.

```bash
node scripts/build.mjs          # -> dist/index.html + dist/surd.html
node scripts/verify.mjs         # HEAD-check every game and cover
node scripts/verify.mjs --write # ...and stamp verified dates
```

Open `dist/index.html` directly in a browser to preview — it works from `file://`.

## Layout

```
data/games.json      the manifest — single source of truth
src/index.html       shell markup (/*STYLE*/, /*GAMES*/, /*APP*/ injection points)
src/app.css          styles
src/app.js           app logic (classic script, IIFE, no modules)
scripts/build.mjs    inlines everything into dist/
scripts/verify.mjs   dead-link checker
```

## Manifest format

```json
{
  "id": "slope",
  "title": "Slope",
  "tags": ["arcade", "3d"],
  "src": "https://cdn.jsdelivr.net/gh/playsurd/surd-assets@main/slope/index.html",
  "cover": "https://cdn.jsdelivr.net/gh/playsurd/surd-covers@main/slope.webp",
  "verified": "2026-08-02",
  "chromebook": true
}
```

`verified` and `chromebook` are maintenance metadata and are stripped from the built payload.

## Contributing rules

- No game assets in this repo. Games live in `surd-assets` / `surd-html`, covers in `surd-covers`.
- No dependencies, no framework, no build step beyond plain Node.
- No `type="module"` and no `fetch()` of a local file — either one breaks the offline build.
- Every game carries a `verified` date. Dead games get removed, not hidden.
