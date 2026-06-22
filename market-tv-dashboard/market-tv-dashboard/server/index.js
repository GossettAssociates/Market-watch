import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CACHE_MS = Number(process.env.YAHOO_CACHE_MS || 45000);

const WATCHLIST = ['AAPL', 'NVDA', 'CRWD', 'NFLX', 'META', 'VZ', 'AMD', 'MSFT'];
const INDEX_SYMBOLS = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX'];
const TICKER_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'BRK-B', 'AVGO',
  'JPM', 'WMT', 'LLY', 'V', 'MA', 'XOM', 'UNH', 'ORCL', 'COST', 'HD',
  'PG', 'NFLX', 'JNJ', 'ABBV', 'BAC', 'KO', 'CRM', 'CVX', 'MRK', 'AMD',
  'PEP', 'TMO', 'LIN', 'MCD', 'CSCO', 'IBM', 'GE', 'ADBE', 'WFC', 'QCOM',
  'ABT', 'CAT', 'DIS', 'TXN', 'AMAT', 'VZ', 'PM', 'INTU', 'NOW', 'DHR',
  'SPGI', 'ISRG', 'GS', 'RTX', 'BKNG', 'NEE', 'PFE', 'LOW', 'HON', 'CMCSA',
  'T', 'BLK', 'TJX', 'COP', 'BA', 'SBUX', 'DE', 'PANW', 'ADP', 'UPS',
  'GILD', 'MU', 'LMT', 'SYK', 'ELV', 'MDLZ', 'PLD', 'BMY', 'C', 'AMGN',
  'REGN', 'CB', 'SCHW', 'SO', 'CVS', 'ZTS', 'FI', 'MMC', 'ANET', 'KLAC',
  'LRCX', 'EQIX', 'PGR', 'ADI', 'MO', 'CL', 'APD', 'CRWD', 'SNOW', 'SHOP'
];

const cache = new Map();

app.use(cors());
app.use(express.json());

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunk(values, size = 45) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'accept': 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 Market-TV-Dashboard/1.0'
      }
    });
    if (!res.ok) throw new Error(`Yahoo Finance request failed: ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.value;
  const value = await loader();
  cache.set(key, { time: Date.now(), value });
  return value;
}

function simplifyQuote(q = {}) {
  const price = q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? null;
  const change = q.regularMarketChange ?? null;
  const changePercent = q.regularMarketChangePercent ?? null;
  return {
    symbol: q.symbol,
    shortName: q.shortName || q.longName || q.displayName || q.symbol,
    price,
    change,
    changePercent,
    currency: q.currency || 'USD',
    marketState: q.marketState || 'UNKNOWN',
    exchange: q.fullExchangeName || q.exchange || '',
    dayHigh: q.regularMarketDayHigh ?? null,
    dayLow: q.regularMarketDayLow ?? null,
    previousClose: q.regularMarketPreviousClose ?? null,
    open: q.regularMarketOpen ?? null,
    volume: q.regularMarketVolume ?? null,
    avgVolume: q.averageDailyVolume3Month ?? null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    timestamp: q.regularMarketTime ? q.regularMarketTime * 1000 : Date.now()
  };
}

async function getQuotes(symbols) {
  const clean = uniq(symbols);
  const groups = chunk(clean);
  const results = [];
  for (const group of groups) {
    const encoded = group.map(encodeURIComponent).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encoded}`;
    const json = await cached(`quotes:${group.join(',')}`, CACHE_MS, () => fetchJson(url));
    results.push(...(json?.quoteResponse?.result || []));
  }
  const bySymbol = new Map(results.map((q) => [q.symbol, simplifyQuote(q)]));
  return clean.map((symbol) => bySymbol.get(symbol)).filter(Boolean);
}

async function getChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`;
  const json = await cached(`chart:${symbol}`, CACHE_MS, () => fetchJson(url));
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return timestamps
    .map((time, index) => ({ time: time * 1000, value: closes[index] }))
    .filter((point) => Number.isFinite(point.value))
    .slice(-80);
}

function buildMarketBrief(watchlist, indexes) {
  const movers = watchlist
    .filter((q) => Number.isFinite(q.changePercent))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const avgChange = watchlist.reduce((sum, q) => sum + (Number(q.changePercent) || 0), 0) / Math.max(watchlist.length, 1);
  const leader = watchlist.filter((q) => Number.isFinite(q.changePercent)).sort((a, b) => b.changePercent - a.changePercent)[0];
  const laggard = watchlist.filter((q) => Number.isFinite(q.changePercent)).sort((a, b) => a.changePercent - b.changePercent)[0];
  const sp500 = indexes.find((q) => q.symbol === '^GSPC');
  const nasdaq = indexes.find((q) => q.symbol === '^IXIC');

  let tone = 'Mixed';
  if (avgChange >= 0.6) tone = 'Bullish';
  if (avgChange <= -0.6) tone = 'Defensive';

  return {
    tone,
    averageWatchlistMove: avgChange,
    topMover: movers[0] || null,
    leader: leader || null,
    laggard: laggard || null,
    summary: `${tone} tape across the focus list. Watchlist average move is ${avgChange.toFixed(2)}%. ${leader ? `${leader.symbol} is leading at ${leader.changePercent.toFixed(2)}%.` : ''} ${laggard ? `${laggard.symbol} is lagging at ${laggard.changePercent.toFixed(2)}%.` : ''}`.trim(),
    sp500ChangePercent: sp500?.changePercent ?? null,
    nasdaqChangePercent: nasdaq?.changePercent ?? null
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, source: 'Yahoo Finance', serverTime: new Date().toISOString() });
});

app.get('/api/quotes', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'Provide symbols, for example /api/quotes?symbols=AAPL,NVDA' });
    const quotes = await getQuotes(symbols);
    res.json({ source: 'Yahoo Finance', updatedAt: new Date().toISOString(), quotes });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to retrieve Yahoo Finance quotes' });
  }
});

app.get('/api/chart/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const chart = await getChart(symbol);
    res.json({ source: 'Yahoo Finance', updatedAt: new Date().toISOString(), symbol, chart });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to retrieve Yahoo Finance chart' });
  }
});

app.get('/api/market', async (_req, res) => {
  try {
    const allSymbols = uniq([...WATCHLIST, ...INDEX_SYMBOLS, ...TICKER_SYMBOLS]);
    const allQuotes = await getQuotes(allSymbols);
    const quoteMap = new Map(allQuotes.map((q) => [q.symbol, q]));
    const watchlist = WATCHLIST.map((symbol) => quoteMap.get(symbol)).filter(Boolean);
    const indexes = INDEX_SYMBOLS.map((symbol) => quoteMap.get(symbol)).filter(Boolean);
    const ticker = TICKER_SYMBOLS.map((symbol) => quoteMap.get(symbol)).filter(Boolean);
    const charts = Object.fromEntries(
      await Promise.all(WATCHLIST.map(async (symbol) => [symbol, await getChart(symbol).catch(() => [])]))
    );

    res.json({
      source: 'Yahoo Finance',
      updatedAt: new Date().toISOString(),
      refreshMs: Number(process.env.MARKET_REFRESH_MS || 60000),
      watchlist,
      indexes,
      ticker,
      charts,
      brief: buildMarketBrief(watchlist, indexes)
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to retrieve market data from Yahoo Finance' });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Market TV Dashboard server running on port ${PORT}`);
});
