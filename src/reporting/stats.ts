import type { Trade } from "../data/storage.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerformanceStats {
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
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentBalance: number;
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
 * Calculate performance stats from closed trades.
 *
 * Reuses the same metric formulas as backtest/metrics.ts but operates
 * on the storage Trade type rather than BacktestTradeResult.
 */
export function getPerformanceStats(
  trades: Trade[],
  initialBalance: number,
): PerformanceStats {
  const closed = trades.filter((t) => t.status === "closed");
  const totalTrades = closed.length;

  if (totalTrades === 0) {
    return emptyStats(initialBalance);
  }

  // Win / loss breakdown
  const winners = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losers = closed.filter((t) => (t.pnl ?? 0) <= 0);

  const winningTrades = winners.length;
  const losingTrades = losers.length;
  const winRate = winningTrades / totalTrades;

  const avgWin = winners.length > 0 ? mean(winners.map((t) => t.pnl ?? 0)) : 0;
  const avgLoss = losers.length > 0 ? mean(losers.map((t) => t.pnl ?? 0)) : 0;

  const grossProfit = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalPnlPercent = (totalPnl / initialBalance) * 100;

  // Max drawdown from cumulative P&L
  let peak = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let equity = initialBalance;

  // Sort by exit_time to reconstruct equity curve
  const sorted = [...closed].sort(
    (a, b) => (a.exit_time ?? "").localeCompare(b.exit_time ?? ""),
  );

  for (const trade of sorted) {
    equity += trade.pnl ?? 0;
    if (equity > peak) {
      peak = equity;
    }
    const dd = peak - equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = ddPct;
    }
  }

  // Sharpe ratio from per-trade returns
  const tradeReturns = sorted.map((t) => (t.pnl_percent ?? 0) / 100);
  const meanReturn = mean(tradeReturns);
  const returnStd = stddev(tradeReturns);
  // Annualize assuming ~252 trading days, ~2 trades/day on average
  const tradesPerYear = Math.min(totalTrades, 252 * 2);
  const sharpeRatio =
    returnStd > 0 ? (meanReturn / returnStd) * Math.sqrt(tradesPerYear) : 0;

  // Best / worst trade
  const pnls = closed.map((t) => t.pnl ?? 0);
  const bestTrade = Math.max(...pnls);
  const worstTrade = Math.min(...pnls);

  // Consecutive wins / losses
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of sorted) {
    if ((trade.pnl ?? 0) > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    }
  }

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
    bestTrade,
    worstTrade,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    currentBalance: equity,
  };
}

// ---------------------------------------------------------------------------
// Empty stats
// ---------------------------------------------------------------------------

function emptyStats(initialBalance: number): PerformanceStats {
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
    bestTrade: 0,
    worstTrade: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    currentBalance: initialBalance,
  };
}
