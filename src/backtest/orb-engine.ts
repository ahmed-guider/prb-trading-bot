import { createLogger } from "../logger.js";
import type { Candle } from "../types.js";
import { isUptrend } from "../indicators/trend.js";
import {
  calculateOpeningRange,
  isValidOpeningRange,
  detectBreakout,
  type OpeningRange,
} from "../indicators/opening-range.js";
import { loadBacktestData, type BacktestDay } from "./data-loader.js";
import { calculateMetrics, type BacktestMetrics } from "./metrics.js";
import type { BacktestTradeResult } from "./engine.js";

const log = createLogger("orb-engine");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ORBParams {
  symbols: string[];
  startDate: string;
  endDate: string;
  initialBalance: number;
  openingRangeMinutes: number;  // 15, 30, etc.
  minORWidthPct: number;        // min OR width as % of price (0.3%)
  maxORWidthPct: number;        // max OR width as % of price (1.5%)
  breakoutBodyRatio: number;    // min body ratio for breakout candle (0.5)
  breakoutVolumeMultiplier: number; // volume must be > this * OR avg volume (1.0)
  target1R: number;             // first target in R multiples (1.0)
  target2R: number;             // second target (2.0)
  stopBuffer: number;           // extra buffer below OR low / above OR high for stop (0.001 = 0.1%)
  timeStopHour: number;         // close remaining by this hour ET (12)
  maxPositions: number;         // max simultaneous positions (3)
  riskPerTrade: number;         // fraction of account to risk (0.02)
  trendFilter: boolean;         // require EMA trend alignment (true)
  trendEmaFast: number;         // fast EMA period for trend filter (20)
  trendEmaSlow: number;         // slow EMA period for trend filter (50)
  allowLong: boolean;           // allow long breakouts (true)
  allowShort: boolean;          // allow short breakdowns (true)
}

export interface PreloadedData {
  allData: Map<string, BacktestDay[]>;
  spyData: BacktestDay[];
}

export interface ORBBacktestResult {
  params: ORBParams;
  trades: BacktestTradeResult[];
  metrics: BacktestMetrics;
  equityCurve: { date: string; equity: number }[];
  dailyReturns: { date: string; pnl: number; trades: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKET_OPEN_HOUR_UTC = 14;  // 9:30 AM ET ~ 14:30 UTC
const MARKET_OPEN_MIN_UTC = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a timestamp as ISO string. */
function tsToISO(ts: number): string {
  return new Date(ts).toISOString();
}

/** Get the approximate ET hour from a UTC timestamp. */
function getETHour(ts: number): number {
  const d = new Date(ts);
  return (d.getUTCHours() - 5 + 24) % 24;
}

/** Check if a candle is at or after market open (9:30 AM ET). */
function isAtOrAfterMarketOpen(candle: Candle): boolean {
  const d = new Date(candle.timestamp);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const marketOpenUtcMinutes = MARKET_OPEN_HOUR_UTC * 60 + MARKET_OPEN_MIN_UTC;
  return utcMinutes >= marketOpenUtcMinutes;
}

/** Get candles at or after market open. */
function marketCandles(fiveMinCandles: Candle[]): Candle[] {
  return fiveMinCandles.filter((c) => isAtOrAfterMarketOpen(c));
}

// ---------------------------------------------------------------------------
// Position tracking
// ---------------------------------------------------------------------------

interface ORBPosition {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  entryTime: number;
  stopLoss: number;
  target1: number;
  target2: number;
  size: number;
  originalSize: number;
  scaledOut1: boolean;
  scaledOut2: boolean;
  stopMovedToBreakeven: boolean;
  date: string;
}

// ---------------------------------------------------------------------------
// Main backtest runner
// ---------------------------------------------------------------------------

export async function preloadORBData(
  symbols: string[],
  startDate: string,
  endDate: string,
): Promise<PreloadedData> {
  const allData = await loadBacktestData(symbols, startDate, endDate);
  let spyData: BacktestDay[] = [];
  if (!symbols.includes("SPY")) {
    const spyMap = await loadBacktestData(["SPY"], startDate, endDate);
    spyData = spyMap.get("SPY") ?? [];
  } else {
    spyData = allData.get("SPY") ?? [];
  }
  return { allData, spyData };
}

export async function runORBBacktest(
  params: ORBParams,
  preloaded?: PreloadedData,
): Promise<ORBBacktestResult> {
  log.info("Starting ORB backtest", {
    symbols: params.symbols.length,
    startDate: params.startDate,
    endDate: params.endDate,
    initialBalance: params.initialBalance,
    openingRangeMinutes: params.openingRangeMinutes,
  });

  // Load or reuse data
  let allData: Map<string, BacktestDay[]>;

  if (preloaded) {
    allData = preloaded.allData;
  } else {
    allData = await loadBacktestData(params.symbols, params.startDate, params.endDate);
  }

  // Collect all unique trading days across all symbols, sorted
  const allDates = new Set<string>();
  for (const days of allData.values()) {
    for (const d of days) {
      allDates.add(d.date);
    }
  }
  const sortedDates = [...allDates].sort();

  log.info(`ORB backtesting over ${sortedDates.length} trading days`);

  // State
  let equity = params.initialBalance;
  let cash = params.initialBalance;
  const trades: BacktestTradeResult[] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  const dailyReturns: { date: string; pnl: number; trades: number }[] = [];
  const activePositions: Map<string, ORBPosition> = new Map();

  // Diagnostic counters (filter funnel)
  let totalSymbolDays = 0;
  let passedEnoughCandles = 0;
  let passedORValid = 0;
  let passedTrendFilter = 0;
  let passedBreakoutDetected = 0;
  let passedPositionLimit = 0;
  let tradesEntered = 0;

  // Day-by-day simulation
  for (const date of sortedDates) {
    let dayPnl = 0;
    let dayTradeCount = 0;

    // Track which symbols already had a breakout today (one per symbol per day)
    const breakoutTakenToday = new Set<string>();

    for (const [symbol, days] of allData) {
      const day = days.find((d) => d.date === date);
      if (!day) continue;
      totalSymbolDays++;

      // Get market-hours candles
      const mktCandles = marketCandles(day.fiveMinCandles);
      const orCandleCount = Math.floor(params.openingRangeMinutes / 5);
      if (mktCandles.length <= orCandleCount) continue;
      passedEnoughCandles++;

      // Step 1: Calculate opening range
      const or = calculateOpeningRange(mktCandles, params.openingRangeMinutes);
      if (!or) continue;

      // Step 2: Validate OR width
      if (!isValidOpeningRange(or, params.minORWidthPct, params.maxORWidthPct)) continue;
      passedORValid++;

      // Step 3: Optional trend filter (daily candles)
      if (params.trendFilter) {
        if (day.dailyCandles.length < params.trendEmaSlow) continue;
        const trend = isUptrend(day.dailyCandles, params.trendEmaFast, params.trendEmaSlow);

        // In uptrend: allow longs. In downtrend: allow shorts.
        // If neither direction is permitted by the trend, skip.
        const trendAllowsLong = trend.uptrend && params.allowLong;
        const trendAllowsShort = !trend.uptrend && params.allowShort;
        if (!trendAllowsLong && !trendAllowsShort) continue;
      }
      passedTrendFilter++;

      // Step 4: Walk through candles AFTER the opening range period
      const postORCandles = mktCandles.slice(orCandleCount);

      for (const candle of postORCandles) {
        // Manage existing position for this symbol first
        if (activePositions.has(symbol)) {
          const position = activePositions.get(symbol)!;
          const result = simulateORCandle(position, candle, params);
          if (result) {
            cash += closePnlToCash(position, result.exitPrice);
            dayPnl += result.pnl;
            dayTradeCount++;
            trades.push(result);
            activePositions.delete(symbol);
          }
          continue; // already in a position or just closed, skip breakout detection
        }

        // Only take first breakout per symbol per day
        if (breakoutTakenToday.has(symbol)) continue;

        // Detect breakout
        let direction: 'long' | 'short' | null;

        if (params.trendFilter) {
          // Determine which direction the trend allows
          const trend = isUptrend(day.dailyCandles, params.trendEmaFast, params.trendEmaSlow);
          const rawDirection = detectBreakout(
            candle, or, params.breakoutBodyRatio, params.breakoutVolumeMultiplier,
          );
          if (!rawDirection) continue;

          // Only allow direction aligned with trend
          if (rawDirection === 'long' && trend.uptrend && params.allowLong) {
            direction = 'long';
          } else if (rawDirection === 'short' && !trend.uptrend && params.allowShort) {
            direction = 'short';
          } else {
            continue;
          }
        } else {
          direction = detectBreakout(
            candle, or, params.breakoutBodyRatio, params.breakoutVolumeMultiplier,
          );
          if (!direction) continue;
          if (direction === 'long' && !params.allowLong) continue;
          if (direction === 'short' && !params.allowShort) continue;
        }

        passedBreakoutDetected++;

        // Respect max positions
        if (activePositions.size >= params.maxPositions) continue;
        passedPositionLimit++;

        // Already have a position in this symbol?
        if (activePositions.has(symbol)) continue;

        breakoutTakenToday.add(symbol);

        // Calculate entry, stop, targets
        const entryPrice = candle.close;
        let stopLoss: number;
        let target1: number;
        let target2: number;

        if (direction === 'long') {
          stopLoss = or.low * (1 - params.stopBuffer);
          const riskPerShare = entryPrice - stopLoss;
          target1 = entryPrice + riskPerShare * params.target1R;
          target2 = entryPrice + riskPerShare * params.target2R;
        } else {
          stopLoss = or.high * (1 + params.stopBuffer);
          const riskPerShare = stopLoss - entryPrice;
          target1 = entryPrice - riskPerShare * params.target1R;
          target2 = entryPrice - riskPerShare * params.target2R;
        }

        // Position sizing based on risk
        const riskPerShare = direction === 'long'
          ? entryPrice - stopLoss
          : stopLoss - entryPrice;

        if (riskPerShare <= 0) continue;

        const riskAmount = equity * params.riskPerTrade;
        let positionSize = Math.floor(riskAmount / riskPerShare);
        if (positionSize <= 0) continue;

        // Check we can afford it
        const cost = entryPrice * positionSize;
        if (cost > cash) {
          positionSize = Math.floor(cash / entryPrice);
          if (positionSize <= 0) continue;
        }

        cash -= entryPrice * positionSize;
        tradesEntered++;

        const position: ORBPosition = {
          symbol,
          direction,
          entryPrice,
          entryTime: candle.timestamp,
          stopLoss,
          target1,
          target2,
          size: positionSize,
          originalSize: positionSize,
          scaledOut1: false,
          scaledOut2: false,
          stopMovedToBreakeven: false,
          date,
        };

        activePositions.set(symbol, position);

        log.debug(
          `${symbol}: ORB ${direction} @ ${entryPrice.toFixed(2)} size=${positionSize} ` +
          `SL=${stopLoss.toFixed(2)} T1=${target1.toFixed(2)} T2=${target2.toFixed(2)}`,
        );
      }
    }

    // End of day: force-close any remaining positions
    for (const [symbol, position] of activePositions) {
      const symbolDays = allData.get(symbol);
      const day = symbolDays?.find((d) => d.date === date);
      if (!day) continue;

      const mktCandlesForDay = marketCandles(day.fiveMinCandles);
      if (mktCandlesForDay.length === 0) continue;

      const lastCandle = mktCandlesForDay[mktCandlesForDay.length - 1];
      const exitPrice = lastCandle.close;
      const pnl = calculatePnl(position, exitPrice);
      const pnlPercent = calculatePnlPercent(position, exitPrice);
      const holdingMinutes = (lastCandle.timestamp - position.entryTime) / (1000 * 60);

      cash += closePnlToCash(position, exitPrice);
      dayPnl += pnl;
      dayTradeCount++;

      trades.push({
        symbol,
        date: position.date,
        entryTime: tsToISO(position.entryTime),
        entryPrice: position.entryPrice,
        exitTime: tsToISO(lastCandle.timestamp),
        exitPrice,
        pnl,
        pnlPercent,
        exitReason: "eod_close",
        holdingMinutes,
      });
    }
    activePositions.clear();

    // Update equity
    equity = cash;
    equityCurve.push({ date, equity });
    dailyReturns.push({ date, pnl: dayPnl, trades: dayTradeCount });

    if (dayTradeCount > 0) {
      log.info(`${date}: ${dayTradeCount} trades, P&L=$${dayPnl.toFixed(2)}, equity=$${equity.toFixed(2)}`);
    }
  }

  // Diagnostic summary (filter funnel)
  log.info("ORB Filter funnel", {
    totalSymbolDays,
    passedEnoughCandles,
    passedORValid,
    passedTrendFilter,
    passedBreakoutDetected,
    passedPositionLimit,
    tradesEntered,
  });

  // Calculate metrics
  const metrics = calculateMetrics(trades, equityCurve, params.initialBalance);

  log.info("ORB Backtest complete", {
    totalTrades: metrics.totalTrades,
    winRate: `${(metrics.winRate * 100).toFixed(1)}%`,
    totalPnl: `$${metrics.totalPnl.toFixed(2)}`,
    sharpe: metrics.sharpeRatio.toFixed(2),
    maxDrawdown: `${metrics.maxDrawdownPercent.toFixed(2)}%`,
  });

  return {
    params,
    trades,
    metrics,
    equityCurve,
    dailyReturns,
  };
}

// ---------------------------------------------------------------------------
// P&L helpers
// ---------------------------------------------------------------------------

function calculatePnl(position: ORBPosition, exitPrice: number): number {
  if (position.direction === 'long') {
    return (exitPrice - position.entryPrice) * position.size;
  }
  return (position.entryPrice - exitPrice) * position.size;
}

function calculatePnlPercent(position: ORBPosition, exitPrice: number): number {
  if (position.direction === 'long') {
    return ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
  }
  return ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
}

/** Return the cash received when closing a position at a given exit price. */
function closePnlToCash(position: ORBPosition, exitPrice: number): number {
  // For both long and short, we originally subtracted entryPrice * size from cash.
  // On close we return the entry cost plus the P&L.
  return position.entryPrice * position.size + calculatePnl(position, exitPrice);
}

// ---------------------------------------------------------------------------
// Single-candle position simulation
// ---------------------------------------------------------------------------

/**
 * Process a single candle for an open ORB position.
 * Check stop loss FIRST (conservative), then targets, then time stop.
 * Returns a BacktestTradeResult if the position is closed, or null if still open.
 */
function simulateORCandle(
  position: ORBPosition,
  candle: Candle,
  params: ORBParams,
): BacktestTradeResult | null {
  const { direction } = position;

  // ----- Stop loss check (FIRST - conservative, assume worst case) -----
  const stopHit = direction === 'long'
    ? candle.low <= position.stopLoss
    : candle.high >= position.stopLoss;

  if (stopHit) {
    const exitPrice = position.stopLoss;
    const pnl = calculatePnl(position, exitPrice);
    const pnlPercent = calculatePnlPercent(position, exitPrice);
    const holdingMinutes = (candle.timestamp - position.entryTime) / (1000 * 60);

    return {
      symbol: position.symbol,
      date: position.date,
      entryTime: tsToISO(position.entryTime),
      entryPrice: position.entryPrice,
      exitTime: tsToISO(candle.timestamp),
      exitPrice,
      pnl,
      pnlPercent,
      exitReason: position.stopMovedToBreakeven ? "breakeven_stop" : "stop_loss",
      holdingMinutes,
    };
  }

  // ----- Target 2 check (full close of remaining) -----
  const target2Hit = direction === 'long'
    ? candle.high >= position.target2
    : candle.low <= position.target2;

  if (!position.scaledOut2 && target2Hit) {
    // Scale out 33% at target 2 and close remaining
    position.scaledOut2 = true;
    const scaleShares = Math.floor(position.originalSize * 0.33);
    position.size = Math.max(1, position.size - scaleShares);

    // If target 2 hit, we fully close the remaining position
    const exitPrice = position.target2;
    const pnl = calculatePnl(position, exitPrice);
    const pnlPercent = calculatePnlPercent(position, exitPrice);
    const holdingMinutes = (candle.timestamp - position.entryTime) / (1000 * 60);

    return {
      symbol: position.symbol,
      date: position.date,
      entryTime: tsToISO(position.entryTime),
      entryPrice: position.entryPrice,
      exitTime: tsToISO(candle.timestamp),
      exitPrice,
      pnl,
      pnlPercent,
      exitReason: "target_2",
      holdingMinutes,
    };
  }

  // ----- Target 1 check (scale out 33%, move stop to breakeven) -----
  const target1Hit = direction === 'long'
    ? candle.high >= position.target1
    : candle.low <= position.target1;

  if (!position.scaledOut1 && target1Hit) {
    position.scaledOut1 = true;
    const scaleShares = Math.floor(position.originalSize * 0.33);
    position.size = Math.max(1, position.size - scaleShares);

    // Move stop to breakeven
    position.stopLoss = position.entryPrice;
    position.stopMovedToBreakeven = true;
  }

  // ----- Time stop -----
  const etHour = getETHour(candle.timestamp);
  if (etHour >= params.timeStopHour) {
    const exitPrice = candle.close;
    const pnl = calculatePnl(position, exitPrice);
    const pnlPercent = calculatePnlPercent(position, exitPrice);
    const holdingMinutes = (candle.timestamp - position.entryTime) / (1000 * 60);

    return {
      symbol: position.symbol,
      date: position.date,
      entryTime: tsToISO(position.entryTime),
      entryPrice: position.entryPrice,
      exitTime: tsToISO(candle.timestamp),
      exitPrice,
      pnl,
      pnlPercent,
      exitReason: "time_stop",
      holdingMinutes,
    };
  }

  // Position still open
  return null;
}
