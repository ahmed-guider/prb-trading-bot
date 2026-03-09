import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getSnapshot, getHistoricalBars } from "../data/market-data.js";
import { db } from "../data/storage.js";
import type { WatchlistStock, Candidate } from "../data/storage.js";
import { calculateGap, hasRelativeStrength } from "../indicators/gap.js";
import { findResistanceLevels } from "../indicators/resistance.js";

const log = createLogger("premarket-scanner");

/**
 * Scan pre-market data (8:00-9:25 AM ET) to find gap-up candidates
 * from the screened watchlist.
 */
export async function scanPremarket(watchlist: WatchlistStock[]): Promise<Candidate[]> {
  if (watchlist.length === 0) {
    log.info("Empty watchlist, nothing to scan");
    return [];
  }

  const today = new Date().toISOString().slice(0, 10);

  log.info(`Scanning ${watchlist.length} watchlist stocks for gap-ups`);

  // Get SPY snapshot for relative strength comparison
  let spyGapPercent = 0;
  try {
    const spySnap = await getSnapshot("SPY");
    const spyPrevClose = spySnap.prevDailyBar.close;
    const spyCurrentPrice = spySnap.latestTrade.price;
    const spyGap = calculateGap(spyPrevClose, spyCurrentPrice);
    spyGapPercent = spyGap.gapPercent;
    log.info(`SPY gap: ${spyGapPercent.toFixed(2)}%`);
  } catch (err) {
    log.warn("Failed to get SPY snapshot, proceeding without relative strength filter", err);
  }

  const candidates: Candidate[] = [];

  for (const stock of watchlist) {
    try {
      // Get snapshot with latest pre-market price
      const snap = await getSnapshot(stock.symbol);
      const prevClose = snap.prevDailyBar.close;
      const premarketPrice = snap.latestTrade.price;

      // Calculate gap percentage
      const gap = calculateGap(prevClose, premarketPrice);

      // Filter: gap must exceed threshold
      if (gap.gapPercent < config.strategy.gapThreshold) {
        log.debug(`${stock.symbol}: gap ${gap.gapPercent.toFixed(2)}% below threshold`);
        continue;
      }

      // Check relative strength vs SPY
      if (!hasRelativeStrength(gap.gapPercent, spyGapPercent)) {
        log.debug(`${stock.symbol}: no relative strength vs SPY`);
        continue;
      }

      // Fetch 5-min candles from prior days to find resistance levels
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 5);

      const fiveMinCandles = await getHistoricalBars(
        stock.symbol,
        "5Min",
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
      );

      const resistanceLevels = findResistanceLevels(fiveMinCandles);
      const resistanceLevel =
        resistanceLevels.length > 0 ? resistanceLevels[0].price : premarketPrice * 1.01;

      const candidate: Candidate = {
        symbol: stock.symbol,
        gap_percent: gap.gapPercent,
        premarket_high: premarketPrice,
        prev_close: prevClose,
        resistance_level: resistanceLevel,
        spy_change: spyGapPercent,
        is_valid: true,
      };

      candidates.push(candidate);

      log.info(`Candidate found: ${stock.symbol} gap=${gap.gapPercent.toFixed(2)}% resistance=${resistanceLevel.toFixed(2)}`);
    } catch (err) {
      log.warn(`${stock.symbol}: error during pre-market scan`, err);
    }
  }

  // Sort by gap % descending
  candidates.sort((a, b) => b.gap_percent - a.gap_percent);

  // Save candidates to storage
  db.saveCandidates(today, candidates);

  log.info(`Pre-market scan complete: ${candidates.length} candidates found`);

  return candidates;
}
