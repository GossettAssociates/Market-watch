# Market TV Dashboard

A dark, TV-friendly market display that pulls recent quote and intraday chart information from Yahoo Finance endpoints through a small Node/Express backend.

## What it shows

- Large cards for: `AAPL`, `NVDA`, `CRWD`, `NFLX`, `META`, `VZ`, `AMD`, `MSFT`
- Current quote, price change, percent change, day range, volume, market state, and a 1-day sparkline for each focus stock
- Major index strip for S&P 500, Dow, Nasdaq, Russell 2000, and VIX
- Market update panel that summarizes the focus list using the latest returned quote data
- Bottom rolling ticker with 100 well-known stocks and current prices
- Current date and time in the top-right corner
- Auto-refresh, defaulting to every 60 seconds

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

The React app calls the backend at `/api/market`. In development, Vite proxies those requests to the Express server.

## Production build

```bash
npm install
npm run build
npm start
```

The Express server serves the built React app and the Yahoo Finance proxy API from the same origin.

## TV / OptiSigns use

1. Deploy the app to a Node-friendly host such as Render, Railway, Fly.io, or a small VPS.
2. In OptiSigns, choose **Website App** and paste the deployed URL.
3. Set the display to landscape 16:9. The layout is designed for 1920×1080 and also works at 1280×720.

## Deploy to Render

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables are optional:
  - `PORT` is set automatically by Render.
  - `MARKET_REFRESH_MS=60000`
  - `YAHOO_CACHE_MS=45000`

## Notes

Yahoo Finance does not require an API key for these public quote/chart endpoints, but the backend caches requests briefly to avoid excess calls and reduce the chance of throttling. For a business-critical display, consider adding a paid market-data provider later and swapping the backend data source while keeping the same front-end layout.
