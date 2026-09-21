# EA Signal — local portfolio tracker

This app lives in `ea-portfolio-tracker/` (the pre-existing folder; the initial request called it `ea-tracker-portfolio`). It is separate from `ai-cx-news/` and its published site.

- Architecture: Node.js 22+ HTTP server and plain HTML/CSS/JavaScript. No frontend framework, build step, database, account, or hosting service. Run npm commands from this directory.
- `lib/data.js` owns Yahoo Finance and Google News requests, validation, cache, dates, and source failure handling. Keep network calls server-side.
- `public/app.js` owns browser local storage and UI state. Always retain an explicitly empty watchlist; never repopulate it on reload. The five default tickers are explicitly described as examples.
- Preserve the CX Signal-inspired navy/blue visual style, desktop left holdings / center news / right calendar layout, responsive stack, keyboard controls, and source attribution.
- Never fabricate quotes, headlines, or event dates. Distinguish estimated earnings, provider dates, and dates extracted from announcement headlines. Do not confuse publication and event dates. Keep stale/partial source warnings and original freshness timestamps.
- Holdings and snapshots are local to the browser origin. The server binds to `127.0.0.1` only. The Mac launcher opens the default local port. No automatic deployment.
- Validate external text/links and ticker symbols; do not render upstream HTML. Dependencies must be pinned through package-lock.json.
- After source-pipeline changes, run `npm run check` and `npm test`. Separate deterministic tests from live-provider and browser checks. Update README when behavior changes.
