/**
 * Local file-based cache for Alpaca market data.
 *
 * Stores candle data as JSON files in .cache/market-data/ to avoid
 * hammering the API on repeated backtests. Cache key is based on
 * symbol, timeframe, start date, and end date.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import type { Candle } from "../types.js";

const log = createLogger("cache");

const CACHE_DIR = join(process.cwd(), ".cache", "market-data");

/** Ensure cache directory exists. */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Build a deterministic filename for a cache entry. */
function cacheKey(symbol: string, timeframe: string, start: string, end: string): string {
  // Sanitize: replace slashes, colons, etc.
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safe(symbol)}_${safe(timeframe)}_${safe(start)}_${safe(end)}.json`;
}

/** Try to read candles from cache. Returns null if not cached. */
export function readFromCache(
  symbol: string,
  timeframe: string,
  start: string,
  end: string,
): Candle[] | null {
  ensureCacheDir();
  const file = join(CACHE_DIR, cacheKey(symbol, timeframe, start, end));

  if (!existsSync(file)) return null;

  try {
    const raw = readFileSync(file, "utf-8");
    const candles: Candle[] = JSON.parse(raw);
    log.debug(`Cache hit: ${symbol} ${timeframe} ${start}→${end} (${candles.length} bars)`);
    return candles;
  } catch {
    // Corrupted cache file — ignore it
    log.warn(`Cache read failed for ${symbol} ${timeframe}, will re-fetch`);
    return null;
  }
}

/** Write candles to cache. */
export function writeToCache(
  symbol: string,
  timeframe: string,
  start: string,
  end: string,
  candles: Candle[],
): void {
  ensureCacheDir();
  const file = join(CACHE_DIR, cacheKey(symbol, timeframe, start, end));

  try {
    writeFileSync(file, JSON.stringify(candles));
    log.debug(`Cached: ${symbol} ${timeframe} ${start}→${end} (${candles.length} bars)`);
  } catch (err) {
    log.warn(`Cache write failed for ${symbol} ${timeframe}`, err);
  }
}
