# EA Signal

A lightweight local portfolio news and events reader inspired by CX Signal. Holdings live on the left, your news briefing in the center, and a calendar plus upcoming events on the right. Smaller screens stack these sections.

## Open it

Double-click **Start EA Signal.command** in Finder. Keep its Terminal window open while using the app; press **Control+C** there to stop it. It installs dependencies on the first run if needed, then opens your browser. Requires Node.js 22 or newer and internet access for new data.

Or run from this folder:

```sh
npm ci       # First run only
npm start
```

Open **http://127.0.0.1:4318**. For a busy port, run `PORT=4319 npm start` and open the printed address. The launcher uses the default port.

There is no build step, API key, account, paid service, or cloud deployment. The server listens only on your computer's loopback address. This project is separate from the published CX Signal website and makes no changes to it.

## Use it

- The initial five companies are an example watchlist, not a claim about your actual investments. Add your own ticker symbols (maximum 20); Yahoo exchange suffixes such as `7203.T` and class tickers such as `BRK-B` are supported when the provider recognizes them.
- Remove any holding with ×. Undo is available for eight seconds.
- Select a holding to filter both news and events. Choose **All holdings** to restore the whole briefing.
- Filter news by earnings or events, sort by newest/company, and load additional stories.
- Navigate months or click a date to filter the event list. **All upcoming** resets the calendar. The default agenda shows the next eight published events; calendar dates can reveal later ones.
- Open a headline or event to view its source. Refresh checks the companies again.

## Data and limits

- Yahoo Finance's unofficial API supplies company validation, the latest regular-session price, daily percentage change, and published earnings/dividend dates through `yahoo-finance2`. Quotes are not a real-time trading feed. Hover a holding to see its quote time. Earnings estimates and date ranges are labeled; missing dates are never invented.
- Google News RSS supplies up to 45 headlines per company over the last 30 days and a separate event-announcement search. Searches use the resolved company name. Results may mention a company in the article rather than the headline, and provider publication dates can reflect updates. Identical normalized headlines are deduplicated in the briefing; related syndicated coverage may remain.
- Conferences and investor events enter the calendar **only if the announcement headline contains an explicit month and day** within the next 180 days. These are labeled **From announcement**, not verified schedules. Recent conference coverage without calendar-ready dates appears in **Event announcements**, which can include past events. This is best-effort discovery, not a complete global conference calendar. Always check the source for details.
- Calendar dates use UTC to keep date-only events from shifting a day. Quote/refresh times use the browser's local timezone. The header date is UTC.
- The app refreshes when opened or when you press Refresh. Successful company responses are cached in server memory for five minutes. Manual refresh bypasses that cache after 30 seconds; requests for the same ticker in progress are shared. Up to three companies refresh concurrently. There is no background timer or scheduler.
- Holdings and last retrieved data are kept in browser local storage. Use the same browser and exact address/port to see them next time. Clearing browser data removes them. Saved snapshots are labeled while rechecking and on connection failures. Failed sources retain old data when available, with visible status warnings. The app can show saved data without internet if the local server is running; it is not an installable offline PWA.
- Ticker/name queries are sent to Yahoo and Google to retrieve information. No holdings quantities, purchase prices, account details, or credentials are collected. It is a watchlist, not a portfolio valuation tool.

Provider availability is not guaranteed. There is no fabricated fallback data. Adding a new ticker requires Yahoo to validate it successfully.

## Project structure

- `server.js`: Node HTTP server; static assets and `/api/company` endpoint.
- `lib/data.js`: provider requests, RSS parsing, date handling, cache, and failure handling.
- `public/index.html`, `public/styles.css`, `public/app.js`: accessible responsive interface, local persistence, and interactions.
- `test/data.test.js`: deterministic parser, date, input-validation, and source-failure tests.

## Development checks

```sh
npm run check
npm test
npm run dev
```

`dev` restarts the server when its files change. Reload the browser to see frontend edits. Tests use fixtures and injected providers, not current market values. Live network checks and browser interaction checks are separate.

Source interfaces: [yahoo-finance2 documentation](https://github.com/gadicc/yahoo-finance2), [Google News](https://news.google.com/).
