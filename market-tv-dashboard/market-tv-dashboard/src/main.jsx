import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const REFRESH_FALLBACK_MS = 60000;

function formatMoney(value, currency = 'USD') {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function changeClass(value) {
  if (!Number.isFinite(value)) return 'flat';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

function Sparkline({ points = [] }) {
  const path = useMemo(() => {
    if (!points.length) return '';
    const values = points.map((p) => p.value).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 220;
    const height = 74;
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - ((point.value - min) / span) * height;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  return (
    <svg className="sparkline" viewBox="0 0 220 74" preserveAspectRatio="none" aria-hidden="true">
      <path d="M 0 62 L 220 62" className="spark-grid" />
      {path ? <path d={path} className="spark-path" /> : <text x="110" y="42" textAnchor="middle">No chart</text>}
    </svg>
  );
}

function Header({ updatedAt, now, source, loading }) {
  return (
    <header className="header">
      <div>
        <p className="eyebrow">Live Market Display</p>
        <h1>Market Command Center</h1>
        <p className="subtitle">Yahoo Finance data • TV optimized • auto-refreshing</p>
      </div>
      <div className="clockPanel">
        <div className="clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <div className="date">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div className="updated">{loading ? 'Refreshing…' : `Updated ${updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}`}</div>
        <div className="source">Source: {source || 'Yahoo Finance'}</div>
      </div>
    </header>
  );
}

function IndexStrip({ indexes = [] }) {
  return (
    <section className="indexStrip">
      {indexes.map((item) => (
        <article className="indexCard" key={item.symbol}>
          <span className="indexName">{item.shortName}</span>
          <strong>{formatMoney(item.price, item.currency)}</strong>
          <span className={`pill ${changeClass(item.changePercent)}`}>{formatPercent(item.changePercent)}</span>
        </article>
      ))}
    </section>
  );
}

function BriefPanel({ brief }) {
  if (!brief) return null;
  return (
    <section className="briefPanel">
      <div>
        <p className="eyebrow">Market Update</p>
        <h2>{brief.tone} read on the focus list</h2>
        <p>{brief.summary}</p>
      </div>
      <div className="briefStats">
        <div>
          <span>Focus Avg.</span>
          <strong className={changeClass(brief.averageWatchlistMove)}>{formatPercent(brief.averageWatchlistMove)}</strong>
        </div>
        <div>
          <span>S&amp;P 500</span>
          <strong className={changeClass(brief.sp500ChangePercent)}>{formatPercent(brief.sp500ChangePercent)}</strong>
        </div>
        <div>
          <span>Nasdaq</span>
          <strong className={changeClass(brief.nasdaqChangePercent)}>{formatPercent(brief.nasdaqChangePercent)}</strong>
        </div>
      </div>
    </section>
  );
}

function StockCard({ quote, chart }) {
  return (
    <article className="stockCard">
      <div className="stockTop">
        <div>
          <h3>{quote.symbol}</h3>
          <p>{quote.shortName}</p>
        </div>
        <span className={`badge ${changeClass(quote.changePercent)}`}>{formatPercent(quote.changePercent)}</span>
      </div>
      <div className="priceRow">
        <strong>{formatMoney(quote.price, quote.currency)}</strong>
        <span className={changeClass(quote.change)}>{Number.isFinite(quote.change) ? `${quote.change > 0 ? '+' : ''}${quote.change.toFixed(2)}` : '—'}</span>
      </div>
      <Sparkline points={chart} />
      <dl className="metrics">
        <div><dt>Open</dt><dd>{formatMoney(quote.open, quote.currency)}</dd></div>
        <div><dt>Day Range</dt><dd>{formatMoney(quote.dayLow, quote.currency)} - {formatMoney(quote.dayHigh, quote.currency)}</dd></div>
        <div><dt>Volume</dt><dd>{formatNumber(quote.volume)}</dd></div>
        <div><dt>State</dt><dd>{quote.marketState}</dd></div>
      </dl>
    </article>
  );
}

function TickerTape({ ticker = [] }) {
  const items = ticker.filter((item) => Number.isFinite(item.price));
  const tape = [...items, ...items];
  return (
    <div className="tickerWrap" aria-label="Top stocks ticker">
      <div className="tickerTrack">
        {tape.map((item, index) => (
          <span className="tickerItem" key={`${item.symbol}-${index}`}>
            <strong>{item.symbol}</strong>
            <span>{formatMoney(item.price, item.currency)}</span>
            <em className={changeClass(item.changePercent)}>{formatPercent(item.changePercent)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }) {
  return (
    <section className="errorPanel">
      <h2>Market data is temporarily unavailable</h2>
      <p>{message}</p>
      <button onClick={onRetry}>Try again</button>
    </section>
  );
}

function App() {
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  async function loadMarket() {
    setLoading(true);
    try {
      const response = await fetch('/api/market', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data = await response.json();
      setMarket(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load market data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarket();
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const refreshMs = market?.refreshMs || REFRESH_FALLBACK_MS;
    const id = setInterval(loadMarket, refreshMs);
    return () => clearInterval(id);
  }, [market?.refreshMs]);

  return (
    <main className="appShell">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <Header updatedAt={market?.updatedAt} now={now} source={market?.source} loading={loading} />
      {error && !market ? (
        <ErrorPanel message={error} onRetry={loadMarket} />
      ) : (
        <>
          <IndexStrip indexes={market?.indexes || []} />
          <BriefPanel brief={market?.brief} />
          <section className="stockGrid">
            {(market?.watchlist || []).map((quote) => (
              <StockCard quote={quote} chart={market?.charts?.[quote.symbol] || []} key={quote.symbol} />
            ))}
          </section>
        </>
      )}
      {error && market ? <div className="inlineError">Last refresh failed: {error}</div> : null}
      <TickerTape ticker={market?.ticker || []} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
