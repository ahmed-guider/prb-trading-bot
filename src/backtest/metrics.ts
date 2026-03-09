import type { BacktestTradeResult } from "./engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgHoldingMinutes: number;
  avgTradesPerDay: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  calmarRatio: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

/**
 * Calculate comprehensive performance metrics from a set of backtest trades
 * and the resulting equity curve.
 */
export function calculateMetrics(
  trades: BacktestTradeResult[],
  equityCurve: { date: string; equity: number }[],
  initialBalance: number,
): BacktestMetrics {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return emptyMetrics();
  }

  // -----------------------------------------------------------------------
  // Win / loss breakdown
  // -----------------------------------------------------------------------

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl <= 0);

  const winningTrades = winners.length;
  const losingTrades = losers.length;
  const winRate = winningTrades / totalTrades;

  const avgWin = winners.length > 0 ? mean(winners.map((t) => t.pnl)) : 0;
  const avgLoss = losers.length > 0 ? mean(losers.map((t) => t.pnl)) : 0;

  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalPnlPercent = (totalPnl / initialBalance) * 100;

  // -----------------------------------------------------------------------
  // Max drawdown from equity curve
  // -----------------------------------------------------------------------

  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let peak = initialBalance;

  for (const point of equityCurve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    const dd = peak - point.equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = ddPct;
    }
  }

  // -----------------------------------------------------------------------
  // Daily returns for Sharpe / Sortino
  // -----------------------------------------------------------------------

  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prevEquity = equityCurve[i - 1].equity;
    if (prevEquity > 0) {
      dailyReturns.push((equityCurve[i].equity - prevEquity) / prevEquity);
    }
  }

  const meanDailyReturn = mean(dailyReturns);
  const dailyStd = stddev(dailyReturns);
  const sharpeRatio = dailyStd > 0 ? (meanDailyReturn / dailyStd) * Math.sqrt(252) : 0;

  // Sortino: downside deviation (only negative returns)
  const negativeReturns = dailyReturns.filter((r) => r < 0);
  const downsideStd = negativeReturns.length > 0 ? stddev(negativeReturns) : 0;
  const sortinoRatio = downsideStd > 0 ? (meanDailyReturn / downsideStd) * Math.sqrt(252) : 0;

  // -----------------------------------------------------------------------
  // Holding time
  // -----------------------------------------------------------------------

  const avgHoldingMinutes = mean(trades.map((t) => t.holdingMinutes));

  // -----------------------------------------------------------------------
  // Trades per day
  // -----------------------------------------------------------------------

  const uniqueDays = new Set(trades.map((t) => t.date));
  const totalDays = equityCurve.length > 0 ? equityCurve.length : 1;
  const avgTradesPerDay = totalTrades / totalDays;

  // -----------------------------------------------------------------------
  // Best / worst trade
  // -----------------------------------------------------------------------

  const bestTrade = Math.max(...trades.map((t) => t.pnl));
  const worstTrade = Math.min(...trades.map((t) => t.pnl));

  // -----------------------------------------------------------------------
  // Consecutive wins / losses
  // -----------------------------------------------------------------------

  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if (trade.pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    }
  }

  // -----------------------------------------------------------------------
  // Calmar ratio = annualized return / max drawdown %
  // -----------------------------------------------------------------------

  const tradingDaysCount = equityCurve.length > 1 ? equityCurve.length : 1;
  const annualizedReturn = totalDays > 0
    ? ((totalPnl / initialBalance) * (252 / tradingDaysCount)) * 100
    : 0;
  const calmarRatio = maxDrawdownPercent > 0 ? annualizedReturn / maxDrawdownPercent : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    totalPnl,
    totalPnlPercent,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    sortinoRatio,
    avgHoldingMinutes,
    avgTradesPerDay,
    bestTrade,
    worstTrade,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    calmarRatio,
  };
}

// ---------------------------------------------------------------------------
// Empty metrics (no trades)
// ---------------------------------------------------------------------------

function emptyMetrics(): BacktestMetrics {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    avgHoldingMinutes: 0,
    avgTradesPerDay: 0,
    bestTrade: 0,
    worstTrade: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    calmarRatio: 0,
  };
}
