import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { readFromCache, writeToCache } from "./cache.js";
import type { Candle } from "../types.js";

const log = createLogger("market-data");

const PAPER_BASE_URL = "https://paper-api.alpaca.markets";
const DATA_BASE_URL = "https://data.alpaca.markets";

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": config.alpaca.apiKey,
    "APCA-API-SECRET-KEY": config.alpaca.apiSecret,
  };
}

// ---------------------------------------------------------------------------
// alpacaFetch – low-level helper
// ---------------------------------------------------------------------------

export async function alpacaFetch(
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  // Data API paths (market data) go to data.alpaca.markets,
  // everything else (account, orders) goes to paper/live base.
  const isDataPath = path.startsWith("/v2/stocks") || path.startsWith("/v1beta");
  const baseUrl = isDataPath ? DATA_BASE_URL : PAPER_BASE_URL;

  const url = new URL(path, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: authHeaders(),
    });

    if (res.status === 429) {
      const delay = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
      log.warn(`Rate limited on ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`);
      await sleep(delay);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca API error ${res.status} on ${path}: ${body}`);
    }

    return res.json();
  }

  throw new Error(`Alpaca API rate limit exceeded after ${RATE_LIMIT_MAX_RETRIES} retries on ${path}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Response-to-Candle mapping
// ---------------------------------------------------------------------------

interface AlpacaBar {
  t: string;   // RFC-3339 timestamp
  o: number;   // open
  h: number;   // high
  l: number;   // low
  c: number;   // close
  v: number;   // volume
}

function mapBarToCandle(bar: AlpacaBar): Candle {
  return {
    timestamp: new Date(bar.t).getTime(),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  };
}

// ---------------------------------------------------------------------------
// getHistoricalBars
// ---------------------------------------------------------------------------

export async function getHistoricalBars(
  symbol: string,
  timeframe: string,
  start: string,
  end: string,
  limit?: number,
): Promise<Candle[]> {
  // Check cache first (only for unlimited requests — cached data is complete)
  if (limit === undefined) {
    const cached = readFromCache(symbol, timeframe, start, end);
    if (cached) return cached;
  }

  const candles: Candle[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      timeframe,
      start,
      end,
      feed: "sip",
    };

    if (limit !== undefined) {
      params.limit = String(limit);
    }

    if (pageToken) {
      params.page_token = pageToken;
    }

    const data = await alpacaFetch(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, params);

    const bars: AlpacaBar[] = data.bars ?? [];
    for (const bar of bars) {
      candles.push(mapBarToCandle(bar));
    }

    pageToken = data.next_page_token ?? undefined;

    // If the caller set a limit and we already have enough, stop paginating.
    if (limit !== undefined && candles.length >= limit) {
      break;
    }
  } while (pageToken);

  log.debug(`Fetched ${candles.length} bars for ${symbol} (${timeframe})`, {
    start,
    end,
    count: candles.length,
  });

  const result = limit !== undefined ? candles.slice(0, limit) : candles;

  // Write to cache (only for unlimited requests)
  if (limit === undefined && result.length > 0) {
    writeToCache(symbol, timeframe, start, end, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// getMultiHistoricalBars — batch endpoint for multiple symbols at once
// ---------------------------------------------------------------------------

/**
 * Fetch historical bars for multiple symbols in a single API call.
 * Uses Alpaca's /v2/stocks/bars endpoint which accepts a comma-separated
 * symbols parameter. Much faster than individual requests.
 */
export async function getMultiHistoricalBars(
  symbols: string[],
  timeframe: string,
  start: string,
  end: string,
): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>();

  // Check cache for each symbol first, collect uncached ones
  const uncached: string[] = [];
  for (const symbol of symbols) {
    const cached = readFromCache(symbol, timeframe, start, end);
    if (cached) {
      result.set(symbol, cached);
    } else {
      uncached.push(symbol);
    }
  }

  if (uncached.length === 0) {
    log.info(`All ${symbols.length} symbols served from cache (${timeframe} ${start}→${end})`);
    return result;
  }

  log.info(`Fetching ${uncached.length} symbols via batch API (${result.size} cached)`);

  // Alpaca multi-bar endpoint: /v2/stocks/bars?symbols=SPY,QQQ,...
  // Process in batches of 10 symbols to avoid URL length issues
  const MULTI_BATCH = 10;
  for (let i = 0; i < uncached.length; i += MULTI_BATCH) {
    const batch = uncached.slice(i, i + MULTI_BATCH);
    const batchCandles = new Map<string, Candle[]>();
    for (const sym of batch) {
      batchCandles.set(sym, []);
    }

    let pageToken: string | undefined;

    do {
      const params: Record<string, string> = {
        symbols: batch.join(","),
        timeframe,
        start,
        end,
        feed: "sip",
        limit: "10000",
      };

      if (pageToken) {
        params.page_token = pageToken;
      }

      const data = await alpacaFetch("/v2/stocks/bars", params);

      // Response format: { bars: { "SPY": [...], "QQQ": [...] }, next_page_token: ... }
      const bars: Record<string, AlpacaBar[]> = data.bars ?? {};
      for (const [sym, symBars] of Object.entries(bars)) {
        const existing = batchCandles.get(sym) ?? [];
        for (const bar of symBars) {
          existing.push(mapBarToCandle(bar));
        }
        batchCandles.set(sym, existing);
      }

      pageToken = data.next_page_token ?? undefined;
    } while (pageToken);

    // Store results and cache
    for (const [sym, candles] of batchCandles) {
      result.set(sym, candles);
      if (candles.length > 0) {
        writeToCache(sym, timeframe, start, end, candles);
      }
      log.debug(`Batch fetched ${candles.length} bars for ${sym} (${timeframe})`);
    }

    // Small delay between batches
    if (i + MULTI_BATCH < uncached.length) {
      await sleep(300);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// getLatestBar
// ---------------------------------------------------------------------------

export async function getLatestBar(symbol: string): Promise<Candle> {
  const data = await alpacaFetch(`/v2/stocks/${encodeURIComponent(symbol)}/bars/latest`, {
    feed: "sip",
  });

  const bar: AlpacaBar = data.bar;
  return mapBarToCandle(bar);
}

// ---------------------------------------------------------------------------
// getSnapshot
// ---------------------------------------------------------------------------

export interface SnapshotResult {
  latestTrade: { price: number; timestamp: string };
  dailyBar: Candle;
  prevDailyBar: Candle;
  minuteBar: Candle;
}

export async function getSnapshot(symbol: string): Promise<SnapshotResult> {
  const data = await alpacaFetch(`/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, {
    feed: "sip",
  });

  return {
    latestTrade: {
      price: data.latestTrade.p,
      timestamp: data.latestTrade.t,
    },
    dailyBar: mapBarToCandle(data.dailyBar),
    prevDailyBar: mapBarToCandle(data.prevDailyBar),
    minuteBar: mapBarToCandle(data.minuteBar),
  };
}

// ---------------------------------------------------------------------------
// getMultipleSnapshots
// ---------------------------------------------------------------------------

export async function getMultipleSnapshots(
  symbols: string[],
): Promise<Map<string, any>> {
  const data = await alpacaFetch("/v2/stocks/snapshots", {
    symbols: symbols.join(","),
    feed: "sip",
  });

  const result = new Map<string, any>();
  for (const [sym, snapshot] of Object.entries(data)) {
    result.set(sym, snapshot);
  }

  return result;
}

// ---------------------------------------------------------------------------
// getSP500Symbols – top 100 by market cap (hardcoded)
// ---------------------------------------------------------------------------

const SP500_TOP_100: string[] = [
  "AAPL", "MSFT", "GOOG", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
  "BRK.B", "JPM", "V", "UNH", "MA", "HD", "PG", "JNJ", "COST",
  "ABBV", "MRK", "KO", "PEP", "AVGO", "LLY", "ORCL", "TMO", "MCD",
  "CSCO", "ABT", "WMT", "CRM", "ACN", "DHR", "NKE", "LIN", "TXN",
  "ADBE", "AMD", "PM", "NEE", "QCOM", "HON", "UNP", "LOW", "INTC",
  "AMGN", "RTX", "BA", "CAT", "GS", "SPGI", "BLK", "ELV", "ISRG",
  "AXP", "MDLZ", "GILD", "ADI", "SYK", "BKNG", "VRTX", "REGN",
  "PANW", "LRCX", "MMC", "CB", "SCHW", "PGR", "MU", "KLAC", "ANET",
  "SNPS", "CDNS", "CME", "FI", "MCK", "MSI", "APH", "PLTR", "NOW",
  "UBER", "GE", "NFLX", "DIS", "T", "VZ", "COP", "CVX", "XOM",
  "SLB", "EOG", "MPC", "PSX", "OXY", "IBM", "PYPL", "ABNB", "SQ",
  "COIN", "SNOW", "CRWD", "DDOG",
];

export function getSP500Symbols(): string[] {
  return [...SP500_TOP_100];
}
