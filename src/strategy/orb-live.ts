/**
 * ORB (Opening Range Breakout) live trading module.
 *
 * Called by cron jobs during market hours:
 * - 10:00 AM ET: Calculate opening ranges for all symbols
 * - 10:05-12:00 PM ET (every 5 min): Scan for breakouts + manage positions
 * - 12:00 PM ET: Time stop — close all remaining positions
 */

import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getHistoricalBars, getLatestBar } from "../data/market-data.js";
import { calculateOpeningRange, isValidOpeningRange, detectBreakout, type OpeningRange } from "../indicators/opening-range.js";
import type { Candle } from "../types.js";
import type { PaperBroker, PaperPosition } from "../execution/paper-broker.js";

const log = createLogger("orb-live");

// ---------------------------------------------------------------------------
// ORB Config (validated params from 4-year out-of-sample backtest)
// ---------------------------------------------------------------------------

export const ORB_CONFIG = {
  symbols: [
    "SPY", "QQQ",
    "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META",
    "TSLA", "AMD", "NFLX", "AVGO", "CRM", "PLTR",
  ],
  openingRangeMinutes: 30,
  minORWidthPct: 0.2,
  maxORWidthPct: 2.0,
  breakoutBodyRatio: 0.5,
  breakoutVolumeMultiplier: 1.0,
  target1R: 1.5,
  target2R: 3.0,
  stopBuffer: 0.001,
  timeStopHour: 12,
  maxPositions: 3,
  riskPerTrade: 0.02,
};

// ---------------------------------------------------------------------------
// State (reset each day)
// ---------------------------------------------------------------------------

interface ORBState {
  date: string;
  openingRanges: Map<string, OpeningRange>;
  breakoutsTaken: Set<string>;
  positionMeta: Map<string, {
    direction: "long" | "short";
    target1: number;
    target2: number;
    scaledOut1: boolean;
    originalStop: number;
  }>;
}

let state: ORBState | null = null;

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureState(): ORBState {
  const today = getToday();
  if (!state || state.date !== today) {
    state = {
      date: today,
      openingRanges: new Map(),
      breakoutsTaken: new Set(),
      positionMeta: new Map(),
    };
    log.info("ORB state reset for new trading day");
  }
  return state;
}

// ---------------------------------------------------------------------------
// Phase 1: Calculate opening ranges (10:00 AM ET)
// ---------------------------------------------------------------------------

export async function calculateOpeningRanges(): Promise<void> {
  const s = ensureState();
  const today = getToday();

  log.info("Calculating opening ranges for all symbols...");

  for (const symbol of ORB_CONFIG.symbols) {
    try {
      // Fetch today's 5-min candles so far
      const candles = await getHistoricalBars(symbol, "5Min", today, today);

      // Filter to market hours (9:30 AM ET = 14:30 UTC)
      const marketCandles = candles.filter((c) => {
        const d = new Date(c.timestamp);
        const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
        return utcMinutes >= 14 * 60 + 30; // 14:30 UTC = 9:30 AM ET
      });

      if (marketCandles.length < 6) {
        log.warn(`${symbol}: only ${marketCandles.length} market candles, need 6 for 30-min OR`);
        continue;
      }

      const or = calculateOpeningRange(marketCandles, ORB_CONFIG.openingRangeMinutes);
      if (!or) {
        log.warn(`${symbol}: could not calculate opening range`);
        continue;
      }

      if (!isValidOpeningRange(or, ORB_CONFIG.minORWidthPct, ORB_CONFIG.maxORWidthPct)) {
        log.info(`${symbol}: OR width out of bounds (${((or.high - or.low) / or.low * 100).toFixed(2)}%), skipping`);
        continue;
      }

      s.openingRanges.set(symbol, or);
      log.info(
        `${symbol}: OR high=${or.high.toFixed(2)} low=${or.low.toFixed(2)} ` +
        `width=${((or.high - or.low) / or.low * 100).toFixed(2)}%`
      );
    } catch (err) {
      log.error(`${symbol}: failed to calculate OR`, err);
    }
  }

  log.info(`Opening ranges calculated for ${s.openingRanges.size}/${ORB_CONFIG.symbols.length} symbols`);
}

// ---------------------------------------------------------------------------
// Phase 2: Scan for breakouts + manage positions (every 5 min after 10:00 AM)
// ---------------------------------------------------------------------------

export async function scanAndManage(broker: PaperBroker): Promise<void> {
  const s = ensureState();

  if (s.openingRanges.size === 0) {
    log.warn("No opening ranges calculated yet, skipping scan");
    return;
  }

  // First: manage existing positions
  await managePositions(broker, s);

  // Then: scan for new breakouts
  await scanForBreakouts(broker, s);
}

async function managePositions(broker: PaperBroker, s: ORBState): Promise<void> {
  const positions = broker.getOpenPositions();

  for (const pos of positions) {
    const meta = s.positionMeta.get(pos.symbol);
    if (!meta) continue; // Not an ORB position

    try {
      const latest = await getLatestBar(pos.symbol);
      const price = latest.close;

      // Check stop loss
      const stopHit = meta.direction === "long"
        ? latest.low <= pos.stopLoss
        : latest.high >= pos.stopLoss;

      if (stopHit) {
        log.info(`${pos.symbol}: STOP HIT at ${pos.stopLoss.toFixed(2)}`);
        await broker.closePosition(pos.symbol, 100, pos.stopLoss, "stop_loss");
        s.positionMeta.delete(pos.symbol);
        continue;
      }

      // Check target 2 (full close)
      const t2Hit = meta.direction === "long"
        ? latest.high >= meta.target2
        : latest.low <= meta.target2;

      if (t2Hit) {
        log.info(`${pos.symbol}: TARGET 2 HIT at ${meta.target2.toFixed(2)}`);
        await broker.closePosition(pos.symbol, 100, meta.target2, "target_2");
        s.positionMeta.delete(pos.symbol);
        continue;
      }

      // Check target 1 (scale out 33%, move stop to breakeven)
      const t1Hit = meta.direction === "long"
        ? latest.high >= meta.target1
        : latest.low <= meta.target1;

      if (t1Hit && !meta.scaledOut1) {
        log.info(`${pos.symbol}: TARGET 1 HIT at ${meta.target1.toFixed(2)}, scaling out 33%`);
        await broker.closePosition(pos.symbol, 33, meta.target1, "target_1_scale");
        meta.scaledOut1 = true;

        // Move stop to breakeven
        const updatedPos = broker.getOpenPositions().find((p) => p.symbol === pos.symbol);
        if (updatedPos) {
          updatedPos.stopLoss = pos.entryPrice;
          log.info(`${pos.symbol}: stop moved to breakeven at ${pos.entryPrice.toFixed(2)}`);
        }
      }
    } catch (err) {
      log.error(`${pos.symbol}: failed to manage position`, err);
    }
  }
}

async function scanForBreakouts(broker: PaperBroker, s: ORBState): Promise<void> {
  const openPositions = broker.getOpenPositions();
  let slotsAvailable = ORB_CONFIG.maxPositions - openPositions.length;

  for (const [symbol, or] of s.openingRanges) {
    if (slotsAvailable <= 0) break;
    if (s.breakoutsTaken.has(symbol)) continue;
    if (openPositions.some((p) => p.symbol === symbol)) continue;

    try {
      const latest = await getLatestBar(symbol);

      const direction = detectBreakout(
        latest, or,
        ORB_CONFIG.breakoutBodyRatio,
        ORB_CONFIG.breakoutVolumeMultiplier,
      );

      if (!direction) continue;

      s.breakoutsTaken.add(symbol);

      // Calculate entry, stop, targets
      const entryPrice = latest.close;
      let stopLoss: number;
      let target1: number;
      let target2: number;

      if (direction === "long") {
        stopLoss = or.low * (1 - ORB_CONFIG.stopBuffer);
        const risk = entryPrice - stopLoss;
        target1 = entryPrice + risk * ORB_CONFIG.target1R;
        target2 = entryPrice + risk * ORB_CONFIG.target2R;
      } else {
        stopLoss = or.high * (1 + ORB_CONFIG.stopBuffer);
        const risk = stopLoss - entryPrice;
        target1 = entryPrice - risk * ORB_CONFIG.target1R;
        target2 = entryPrice - risk * ORB_CONFIG.target2R;
      }

      // Position sizing
      const riskPerShare = direction === "long"
        ? entryPrice - stopLoss
        : stopLoss - entryPrice;

      if (riskPerShare <= 0) continue;

      const riskAmount = broker.getBalance() * ORB_CONFIG.riskPerTrade;
      let size = Math.floor(riskAmount / riskPerShare);
      if (size <= 0) continue;

      const cost = entryPrice * size;
      if (cost > broker.getBalance()) {
        size = Math.floor(broker.getBalance() / entryPrice);
        if (size <= 0) continue;
      }

      // Open via paper broker
      const signal = {
        symbol,
        entryPrice,
        stopLoss,
        target1,
        target2,
        target3: target2,
        resistanceLevel: or.high,
        gapPercent: 0,
        confidence: 1,
      };

      const tradeId = await broker.openPosition(signal, size);

      // Store ORB-specific metadata
      s.positionMeta.set(symbol, {
        direction,
        target1,
        target2,
        scaledOut1: false,
        originalStop: stopLoss,
      });

      slotsAvailable--;

      log.info(
        `BREAKOUT ${direction.toUpperCase()}: ${symbol} @ ${entryPrice.toFixed(2)}, ` +
        `size=${size}, SL=${stopLoss.toFixed(2)}, T1=${target1.toFixed(2)}, T2=${target2.toFixed(2)}`
      );
    } catch (err) {
      log.error(`${symbol}: failed to process breakout`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Time stop — close all remaining positions (12:00 PM ET)
// ---------------------------------------------------------------------------

export async function timeStopAll(broker: PaperBroker): Promise<void> {
  const s = ensureState();
  const positions = broker.getOpenPositions();

  log.info(`Time stop: closing ${positions.length} remaining positions`);

  for (const pos of positions) {
    if (!s.positionMeta.has(pos.symbol)) continue; // Not an ORB position

    try {
      const latest = await getLatestBar(pos.symbol);
      await broker.closePosition(pos.symbol, 100, latest.close, "time_stop");
      s.positionMeta.delete(pos.symbol);
      log.info(`${pos.symbol}: time-stopped at ${latest.close.toFixed(2)}`);
    } catch (err) {
      log.error(`${pos.symbol}: failed to time-stop`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Reset state for new day
// ---------------------------------------------------------------------------

export function resetORBState(): void {
  state = null;
  log.info("ORB state cleared");
}

// ---------------------------------------------------------------------------
// Get current ORB status (for dashboard)
// ---------------------------------------------------------------------------

export function getORBStatus() {
  const s = state;
  if (!s) {
    return { date: getToday(), phase: "idle", openingRanges: 0, breakouts: 0, positions: 0 };
  }

  return {
    date: s.date,
    phase: s.openingRanges.size === 0 ? "waiting_for_or" : "monitoring",
    openingRanges: s.openingRanges.size,
    breakouts: s.breakoutsTaken.size,
    positions: s.positionMeta.size,
    ranges: Object.fromEntries(
      [...s.openingRanges].map(([sym, or]) => [sym, {
        high: or.high,
        low: or.low,
        widthPct: ((or.high - or.low) / or.low * 100).toFixed(2) + "%",
      }])
    ),
  };
}
