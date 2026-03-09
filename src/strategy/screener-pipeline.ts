import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getSP500Symbols, getHistoricalBars } from "../data/market-data.js";
import { db } from "../data/storage.js";
import type { WatchlistStock } from "../data/storage.js";
import { isUptrend } from "../indicators/trend.js";

const log = createLogger("screener");

const MIN_AVG_VOLUME = 10_000_000;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const LOOKBACK_DAYS = 60;
const VOLUME_AVG_DAYS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the daily screener pipeline (~8 AM ET).
 *
 * Fetches daily candles for all S&P 500 symbols, filters by average volume
 * and uptrend, then saves the resulting watchlist.
 */
export async function runScreener(): Promise<WatchlistStock[]> {
  const symbols = getSP500Symbols();
  const today = new Date().toISOString().slice(0, 10);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);

  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  log.info(`Running screener for ${symbols.length} symbols`, { start, end });

  const watchlist: WatchlistStock[] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        try {
          const candles = await getHistoricalBars(symbol, "1Day", start, end);

          if (candles.length < VOLUME_AVG_DAYS) {
            log.debug(`${symbol}: insufficient data (${candles.length} candles)`);
            return null;
          }

          // Calculate average volume over last 20 days
          const recentCandles = candles.slice(-VOLUME_AVG_DAYS);
          const avgVolume =
            recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;

          if (avgVolume < MIN_AVG_VOLUME) {
            log.debug(`${symbol}: avg volume ${avgVolume.toFixed(0)} below threshold`);
            return null;
          }

          // Check uptrend using EMA crossover
          const trend = isUptrend(
            candles,
            config.strategy.trendEmaFast,
            config.strategy.trendEmaSlow,
          );

          if (!trend.uptrend) {
            log.debug(`${symbol}: not in uptrend`);
            return null;
          }

          const stock: WatchlistStock = {
            symbol,
            avg_volume: avgVolume,
            ema_fast: trend.emaFast,
            ema_slow: trend.emaSlow,
            in_uptrend: true,
          };

          return stock;
        } catch (err) {
          log.warn(`${symbol}: error fetching data`, err);
          return null;
        }
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        watchlist.push(result.value);
      }
    }

    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < symbols.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Save to database
  db.saveWatchlist(today, watchlist);

  log.info(`Screener complete: ${watchlist.length} stocks passed filters`, {
    total: symbols.length,
    passed: watchlist.length,
  });

  return watchlist;
}
