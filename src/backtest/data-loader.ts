import { createLogger } from "../logger.js";
import { getHistoricalBars } from "../data/market-data.js";
import type { Candle } from "../types.js";

const log = createLogger("backtest-data-loader");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestDay {
  date: string; // YYYY-MM-DD
  symbol: string;
  dailyCandles: Candle[];     // daily candles up to this date (for trend analysis)
  fiveMinCandles: Candle[];   // 5-min candles for this trading day
  previousClose: number;
  premarketHigh: number;      // highest price between 4:00 AM - 9:30 AM ET
  avgVolume: number;          // 20-day average volume
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pause for rate-limit friendliness. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get trading days from daily candles (each candle timestamp represents a
 * trading day). Returns dates as YYYY-MM-DD strings sorted ascending.
 */
function extractTradingDays(dailyCandles: Candle[], startDate: string, endDate: string): string[] {
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${endDate}T23:59:59Z`).getTime();

  return dailyCandles
    .filter((c) => c.timestamp >= startMs && c.timestamp <= endMs)
    .map((c) => {
      const d = new Date(c.timestamp);
      return d.toISOString().slice(0, 10);
    })
    .sort();
}

/**
 * Calculate 20-day average volume ending at `dayIndex` (inclusive).
 */
function calcAvgVolume(dailyCandles: Candle[], dayIndex: number): number {
  const window = 20;
  const start = Math.max(0, dayIndex - window + 1);
  const slice = dailyCandles.slice(start, dayIndex + 1);
  if (slice.length === 0) return 0;

  const total = slice.reduce((sum, c) => sum + c.volume, 0);
  return total / slice.length;
}

/**
 * Extract the pre-market high from 5-min candles for a given trading day.
 * Pre-market is defined as 4:00 AM to 9:30 AM ET.
 * If no pre-market data is found, fall back to the first regular-hours candle open.
 */
function getPremarketHigh(fiveMinCandles: Candle[], dateStr: string): number {
  // Build ET boundaries for pre-market on this date.
  // We approximate ET as UTC-5 for simplicity; DST shifts it by 1 hour
  // but the effect on pre-market detection is negligible for backtesting.
  const datePart = dateStr; // YYYY-MM-DD
  const premarketStartUtc = new Date(`${datePart}T09:00:00Z`).getTime(); // 4 AM ET ≈ 9 AM UTC
  const marketOpenUtc = new Date(`${datePart}T14:30:00Z`).getTime();     // 9:30 AM ET = 14:30 UTC

  const premarketBars = fiveMinCandles.filter(
    (c) => c.timestamp >= premarketStartUtc && c.timestamp < marketOpenUtc,
  );

  if (premarketBars.length > 0) {
    return Math.max(...premarketBars.map((c) => c.high));
  }

  // Fallback: use the open of the first candle at or after market open
  const marketBars = fiveMinCandles.filter((c) => c.timestamp >= marketOpenUtc);
  if (marketBars.length > 0) {
    return marketBars[0].open;
  }

  return 0;
}

/**
 * Filter 5-min candles that belong to a specific trading day.
 * A trading day spans from ~4:00 AM ET to 8:00 PM ET
 * (pre-market through after-hours).
 */
function candlesForDay(fiveMinCandles: Candle[], dateStr: string): Candle[] {
  const dayStartUtc = new Date(`${dateStr}T09:00:00Z`).getTime();  // ~4 AM ET
  const dayEndUtc = new Date(`${dateStr}T21:00:00Z`).getTime();    // ~4 PM ET (conservative)

  return fiveMinCandles.filter(
    (c) => c.timestamp >= dayStartUtc && c.timestamp < dayEndUtc,
  );
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

/**
 * Load and organise historical data for backtesting.
 *
 * For each symbol, fetches daily and 5-min candles over the requested date
 * range (plus lookback for indicators), then organises the data by
 * trading day.
 */
export async function loadBacktestData(
  symbols: string[],
  startDate: string,
  endDate: string,
): Promise<Map<string, BacktestDay[]>> {
  log.info(`Loading backtest data for ${symbols.length} symbols from ${startDate} to ${endDate}`);

  const result = new Map<string, BacktestDay[]>();

  // We need extra lookback for the slow EMA (50 days) and 20-day avg volume
  const lookbackDays = 70;
  const lookbackDate = new Date(startDate);
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
  const lookbackStr = lookbackDate.toISOString().slice(0, 10);

  // Process symbols in batches to respect rate limits
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (symbol) => {
      try {
        const days = await loadSymbolData(symbol, lookbackStr, startDate, endDate);
        result.set(symbol, days);
        log.info(`${symbol}: loaded ${days.length} backtest days`);
      } catch (err) {
        log.warn(`${symbol}: failed to load backtest data`, err);
        result.set(symbol, []);
      }
    });

    await Promise.all(batchPromises);

    // Rate-limit pause between batches
    if (i + BATCH_SIZE < symbols.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  log.info(`Backtest data loaded for ${result.size} symbols`);
  return result;
}

/**
 * Load daily + 5-min data for a single symbol and organise into BacktestDay[].
 */
async function loadSymbolData(
  symbol: string,
  lookbackStart: string,
  startDate: string,
  endDate: string,
): Promise<BacktestDay[]> {
  // Fetch daily candles (including lookback period for EMA/avg volume)
  const dailyCandles = await getHistoricalBars(symbol, "1Day", lookbackStart, endDate);

  if (dailyCandles.length === 0) {
    log.warn(`${symbol}: no daily candles found`);
    return [];
  }

  // Fetch 5-min candles for the actual backtest period
  const fiveMinCandles = await getHistoricalBars(symbol, "5Min", startDate, endDate);

  // Determine trading days within the backtest range from daily candles
  const tradingDays = extractTradingDays(dailyCandles, startDate, endDate);

  const backtestDays: BacktestDay[] = [];

  for (const dateStr of tradingDays) {
    // Find the index of this day in the full daily candle array
    const dayMs = new Date(`${dateStr}T00:00:00Z`).getTime();
    const dayIndex = dailyCandles.findIndex((c) => {
      const cDate = new Date(c.timestamp).toISOString().slice(0, 10);
      return cDate === dateStr;
    });

    if (dayIndex < 0) continue;

    // Daily candles up to (but not including) this day — for trend analysis
    const dailyCandlesUpToDay = dailyCandles.slice(0, dayIndex);
    if (dailyCandlesUpToDay.length === 0) continue;

    // Previous close
    const previousClose = dailyCandlesUpToDay[dailyCandlesUpToDay.length - 1].close;

    // 5-min candles for this specific day
    const dayFiveMinCandles = candlesForDay(fiveMinCandles, dateStr);
    if (dayFiveMinCandles.length === 0) continue;

    // Pre-market high
    const premarketHigh = getPremarketHigh(fiveMinCandles, dateStr);

    // 20-day average volume (using daily candles up to and including the previous day)
    const avgVolume = calcAvgVolume(dailyCandlesUpToDay, dailyCandlesUpToDay.length - 1);

    backtestDays.push({
      date: dateStr,
      symbol,
      dailyCandles: dailyCandlesUpToDay,
      fiveMinCandles: dayFiveMinCandles,
      previousClose,
      premarketHigh: premarketHigh || previousClose, // fallback
      avgVolume,
    });
  }

  return backtestDays;
}
