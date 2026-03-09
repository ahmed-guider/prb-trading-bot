import { createLogger } from "../logger.js";
import type { Candle } from "../types.js";
import { isUptrend } from "../indicators/trend.js";
import { findResistanceLevels } from "../indicators/resistance.js";
import { calculateGap, hasRelativeStrength } from "../indicators/gap.js";
import { isBreakoutCandle } from "../indicators/candle-patterns.js";
import { calculateScaleOutPrice } from "../strategy/exit-manager.js";
import { PaperBroker } from "../execution/paper-broker.js";
import type { EntrySignal } from "../strategy/entry-signals.js";
import { loadBacktestData, type BacktestDay } from "./data-loader.js";
import { calculateMetrics, type BacktestMetrics } from "./metrics.js";

const log = createLogger("backtest-engine");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestParams {
  symbols: string[];
  startDate: string;
  endDate: string;
  initialBalance: number;
  gapThreshold: number;
  trendEmaFast: number;
  trendEmaSlow: number;
  momentumBodyRatio: number;
  momentumWickMax: number;
  scaleOut1: number;
  scaleOut2: number;
  scaleOut3: number;
  stopLossBuffer: number;
  maxPositions: number;
  riskPerTrade: number;
  dailyLossLimit: number;
  leverageMultiplier: number;
  timeStopHour: number;
}

export interface BacktestTradeResult {
  symbol: string;
  date: string;
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  exitReason: string;
  holdingMinutes: number;
}

export interface BacktestResult {
  params: BacktestParams;
  trades: BacktestTradeResult[];
  metrics: BacktestMetrics;
  equityCurve: { date: string; equity: number }[];
  dailyReturns: { date: string; pnl: number; trades: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKET_OPEN_HOUR_UTC = 14;  // 9:30 AM ET ≈ 14:30 UTC
const MARKET_OPEN_MIN_UTC = 30;
const MIN_AVG_VOLUME = 10_000_000; // 10M shares
const PRICE_TARGET_1_PCT = 1;
const PRICE_TARGET_2_PCT = 2;
const PRICE_TARGET_3_PCT = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a candle timestamp to a Date. */
function tsToDate(ts: number): Date {
  return new Date(ts);
}

/** Format a timestamp as ISO string. */
function tsToISO(ts: number): string {
  return new Date(ts).toISOString();
}

/** Get the approximate ET hour from a UTC timestamp. */
function getETHour(ts: number): number {
  // Approximate: use UTC-5 (ignoring DST for simplicity; off by 1h in summer)
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

/** Get candles before market open (for resistance calculation). */
function premarketCandles(fiveMinCandles: Candle[]): Candle[] {
  return fiveMinCandles.filter((c) => !isAtOrAfterMarketOpen(c));
}

/** Get candles at or after market open. */
function marketCandles(fiveMinCandles: Candle[]): Candle[] {
  return fiveMinCandles.filter((c) => isAtOrAfterMarketOpen(c));
}

// ---------------------------------------------------------------------------
// Position tracking (lightweight, within the engine)
// ---------------------------------------------------------------------------

interface ActivePosition {
  symbol: string;
  entryPrice: number;
  entryTime: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  size: number;
  originalSize: number;
  scaledOut1: boolean;
  scaledOut2: boolean;
  scaledOut3: boolean;
  date: string;
}

// ---------------------------------------------------------------------------
// Main backtest runner
// ---------------------------------------------------------------------------

/**
 * Run a full backtest over the specified date range and symbols.
 *
 * The engine replays historical data day-by-day, screening stocks for
 * gap-up setups, detecting breakout entries on 5-min candles, and
 * simulating trade management (scale-outs, stop loss, time stop).
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  log.info("Starting backtest", {
    symbols: params.symbols.length,
    startDate: params.startDate,
    endDate: params.endDate,
    initialBalance: params.initialBalance,
  });

  // Load historical data
  const allData = await loadBacktestData(params.symbols, params.startDate, params.endDate);

  // Also load SPY data for relative strength checks
  let spyData: BacktestDay[] = [];
  if (!params.symbols.includes("SPY")) {
    const spyMap = await loadBacktestData(["SPY"], params.startDate, params.endDate);
    spyData = spyMap.get("SPY") ?? [];
  } else {
    spyData = allData.get("SPY") ?? [];
  }

  // Build a map of SPY gap% by date for quick lookups
  const spyGapByDate = new Map<string, number>();
  for (const day of spyData) {
    const gap = calculateGap(day.previousClose, day.premarketHigh);
    spyGapByDate.set(day.date, gap.gapPercent);
  }

  // Collect all unique trading days across all symbols, sorted
  const allDates = new Set<string>();
  for (const days of allData.values()) {
    for (const d of days) {
      allDates.add(d.date);
    }
  }
  const sortedDates = [...allDates].sort();

  log.info(`Backtesting over ${sortedDates.length} trading days`);

  // State
  let equity = params.initialBalance;
  let cash = params.initialBalance;
  const trades: BacktestTradeResult[] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  const dailyReturns: { date: string; pnl: number; trades: number }[] = [];
  const activePositions: Map<string, ActivePosition> = new Map();

  // Diagnostic counters
  let totalSymbolDays = 0;
  let passedVolume = 0;
  let passedTrend = 0;
  let passedGap = 0;
  let passedRelStr = 0;
  let passedBreakout = 0;

  // Day-by-day simulation
  for (const date of sortedDates) {
    const dayStartEquity = equity;
    let dayPnl = 0;
    let dayTradeCount = 0;

    // Check daily loss limit
    const dailyLossThreshold = params.initialBalance * params.dailyLossLimit;

    // ----- Step 1: Screen symbols -----
    const candidates: { day: BacktestDay; gapPercent: number }[] = [];

    for (const [symbol, days] of allData) {
      if (symbol === "SPY") continue;

      const day = days.find((d) => d.date === date);
      if (!day) continue;
      totalSymbolDays++;

      // Volume filter
      if (day.avgVolume < MIN_AVG_VOLUME) continue;
      passedVolume++;

      // Trend filter: check uptrend on daily candles
      if (day.dailyCandles.length < params.trendEmaSlow) continue;
      const trend = isUptrend(day.dailyCandles, params.trendEmaFast, params.trendEmaSlow);
      if (!trend.uptrend) continue;
      passedTrend++;

      // ----- Step 2: Gap filter -----
      const gap = calculateGap(day.previousClose, day.premarketHigh);
      if (gap.gapPercent < params.gapThreshold) continue;
      passedGap++;

      // Relative strength vs SPY
      const spyGap = spyGapByDate.get(date) ?? 0;
      if (!hasRelativeStrength(gap.gapPercent, spyGap)) continue;
      passedRelStr++;

      candidates.push({ day, gapPercent: gap.gapPercent });
    }

    // Sort candidates by gap size descending (best opportunities first)
    candidates.sort((a, b) => b.gapPercent - a.gapPercent);

    // ----- Step 3 & 4: Entry detection and trade simulation -----

    // First, process any existing positions through today's candles
    for (const [symbol, position] of activePositions) {
      const symbolDays = allData.get(symbol);
      const day = symbolDays?.find((d) => d.date === date);
      if (!day) continue;

      const mktCandles = marketCandles(day.fiveMinCandles);
      const result = simulatePosition(position, mktCandles, params);

      if (result) {
        cash += result.exitPrice * position.size;
        dayPnl += result.pnl;
        dayTradeCount++;
        trades.push(result);
        activePositions.delete(symbol);
      }
    }

    // Then look for new entries
    for (const { day } of candidates) {
      // Respect max positions
      if (activePositions.size >= params.maxPositions) break;

      // Check daily loss limit
      if (dayPnl < -dailyLossThreshold) {
        log.debug(`Daily loss limit hit on ${date}, skipping remaining entries`);
        break;
      }

      const mktCandles = marketCandles(day.fiveMinCandles);
      if (mktCandles.length < 2) continue;

      // Find resistance from pre-market candles (or prior day's 5-min candles)
      const preCandles = premarketCandles(day.fiveMinCandles);
      const resistanceSrc = preCandles.length >= 3 ? preCandles : day.fiveMinCandles.slice(0, 5);
      const resistanceLevels = findResistanceLevels(resistanceSrc);
      const topResistance = resistanceLevels.length > 0 ? resistanceLevels[0].price : day.premarketHigh;

      // Check the first candle after market open for a breakout
      const firstCandle = mktCandles[0];
      const breakout = isBreakoutCandle(
        firstCandle,
        topResistance,
        params.momentumBodyRatio,
        params.momentumWickMax,
      );

      if (!breakout) continue;
      passedBreakout++;

      // Already have a position in this symbol?
      if (activePositions.has(day.symbol)) continue;

      // Calculate position size based on risk
      const entryPrice = firstCandle.close;
      const stopLoss = firstCandle.low * (1 - params.stopLossBuffer);
      const riskPerShare = entryPrice - stopLoss;

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

      // Price targets
      const target1 = entryPrice * (1 + PRICE_TARGET_1_PCT / 100);
      const target2 = entryPrice * (1 + PRICE_TARGET_2_PCT / 100);
      const target3 = entryPrice * (1 + PRICE_TARGET_3_PCT / 100);

      cash -= entryPrice * positionSize;

      const position: ActivePosition = {
        symbol: day.symbol,
        entryPrice,
        entryTime: firstCandle.timestamp,
        stopLoss,
        target1,
        target2,
        target3,
        size: positionSize,
        originalSize: positionSize,
        scaledOut1: false,
        scaledOut2: false,
        scaledOut3: false,
        date,
      };

      activePositions.set(day.symbol, position);

      log.debug(
        `${day.symbol}: entered @ ${entryPrice.toFixed(2)} size=${positionSize} ` +
        `SL=${stopLoss.toFixed(2)} T1=${target1.toFixed(2)} T2=${target2.toFixed(2)} T3=${target3.toFixed(2)}`,
      );

      // Walk through remaining candles for this position
      const remainingCandles = mktCandles.slice(1);
      const result = simulatePosition(position, remainingCandles, params);

      if (result) {
        cash += result.exitPrice * position.size;
        dayPnl += result.pnl;
        dayTradeCount++;
        trades.push(result);
        activePositions.delete(day.symbol);
      }
    }

    // End of day: force-close any remaining positions at the last candle close
    for (const [symbol, position] of activePositions) {
      const symbolDays = allData.get(symbol);
      const day = symbolDays?.find((d) => d.date === date);
      if (!day) continue;

      const mktCandles = marketCandles(day.fiveMinCandles);
      if (mktCandles.length === 0) continue;

      const lastCandle = mktCandles[mktCandles.length - 1];
      const exitPrice = lastCandle.close;
      const pnl = (exitPrice - position.entryPrice) * position.size;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
      const holdingMinutes =
        (lastCandle.timestamp - position.entryTime) / (1000 * 60);

      cash += exitPrice * position.size;
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

  // Diagnostic summary
  log.info("Filter funnel", {
    totalSymbolDays,
    passedVolume,
    passedTrend,
    passedGap,
    passedRelStr,
    passedBreakout,
  });

  // Calculate metrics
  const metrics = calculateMetrics(trades, equityCurve, params.initialBalance);

  log.info("Backtest complete", {
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
// Simulate walking through candles for a position
// ---------------------------------------------------------------------------

/**
 * Walk through candles sequentially, checking exit conditions.
 * For each candle, check stop loss FIRST (conservative), then targets,
 * then time stop. Does NOT peek ahead.
 *
 * Returns a BacktestTradeResult if the position is closed, or null if
 * the position remains open at the end of the provided candles.
 */
function simulatePosition(
  position: ActivePosition,
  candles: Candle[],
  params: BacktestParams,
): BacktestTradeResult | null {
  for (const candle of candles) {
    // ----- Stop loss check (FIRST — conservative, assume worst case) -----
    if (candle.low <= position.stopLoss) {
      const exitPrice = position.stopLoss;
      const pnl = (exitPrice - position.entryPrice) * position.size;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
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
        exitReason: "stop_loss",
        holdingMinutes,
      };
    }

    // ----- Scale-out targets -----
    // Target 3 (final) — full close
    if (!position.scaledOut3 && candle.high >= position.target3) {
      position.scaledOut3 = true;
      const exitPrice = position.target3;
      const pnl = (exitPrice - position.entryPrice) * position.size;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
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
        exitReason: "target_3",
        holdingMinutes,
      };
    }

    // Target 2 — scale out 33%, move stop to breakeven
    if (!position.scaledOut2 && candle.high >= position.target2) {
      position.scaledOut2 = true;
      const scaleShares = Math.floor(position.originalSize * 0.33);
      position.size = Math.max(1, position.size - scaleShares);
      position.stopLoss = position.entryPrice; // move stop to breakeven
    }

    // Target 1 — scale out 33%
    if (!position.scaledOut1 && candle.high >= position.target1) {
      position.scaledOut1 = true;
      const scaleShares = Math.floor(position.originalSize * 0.33);
      position.size = Math.max(1, position.size - scaleShares);
    }

    // ----- Time stop -----
    const etHour = getETHour(candle.timestamp);
    if (etHour >= params.timeStopHour) {
      const exitPrice = candle.close;
      const pnl = (exitPrice - position.entryPrice) * position.size;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
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
  }

  // Position still open
  return null;
}
