import type { Trade } from "../data/storage.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyReport {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  totalPnlPercent: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  trades: Trade[];
}

// ---------------------------------------------------------------------------
// Trade journal formatting
// ---------------------------------------------------------------------------

/**
 * Format a list of trades as a markdown table for human review.
 */
export function formatTradeJournal(trades: Trade[]): string {
  if (trades.length === 0) {
    return "No trades to display.";
  }

  const header = [
    "| Date | Symbol | Entry | Exit | P&L | P&L% | Exit Reason | Holding Time |",
    "|------|--------|-------|------|-----|------|-------------|--------------|",
  ];

  const rows = trades.map((t) => {
    const entryPrice = `$${t.entry_price.toFixed(2)}`;
    const exitPrice = t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : "-";
    const pnl = t.pnl != null ? formatPnl(t.pnl) : "-";
    const pnlPct = t.pnl_percent != null ? `${t.pnl_percent.toFixed(2)}%` : "-";
    const exitReason = t.exit_reason ?? t.status;
    const holdingTime = computeHoldingTime(t);

    return `| ${t.date} | ${t.symbol} | ${entryPrice} | ${exitPrice} | ${pnl} | ${pnlPct} | ${exitReason} | ${holdingTime} |`;
  });

  return [...header, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Daily report
// ---------------------------------------------------------------------------

/**
 * Aggregate stats for a single trading day.
 */
export function getDailyReport(date: string, trades: Trade[]): DailyReport {
  const dayTrades = trades.filter((t) => t.date === date && t.status === "closed");

  const wins = dayTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = dayTrades.filter((t) => (t.pnl ?? 0) <= 0).length;
  const totalPnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  // Find best and worst trades
  let bestTrade: { symbol: string; pnl: number } | null = null;
  let worstTrade: { symbol: string; pnl: number } | null = null;

  for (const t of dayTrades) {
    const pnl = t.pnl ?? 0;
    if (bestTrade === null || pnl > bestTrade.pnl) {
      bestTrade = { symbol: t.symbol, pnl };
    }
    if (worstTrade === null || pnl < worstTrade.pnl) {
      worstTrade = { symbol: t.symbol, pnl };
    }
  }

  // Sum position sizes to approximate total capital at risk for P&L%
  const totalCost = dayTrades.reduce(
    (s, t) => s + t.entry_price * t.position_size,
    0,
  );
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return {
    date,
    totalTrades: dayTrades.length,
    wins,
    losses,
    totalPnl,
    totalPnlPercent,
    bestTrade,
    worstTrade,
    trades: dayTrades,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${pnl.toFixed(2)}`;
}

function computeHoldingTime(trade: Trade): string {
  if (!trade.exit_time) return "-";

  const entryMs = new Date(trade.entry_time).getTime();
  const exitMs = new Date(trade.exit_time).getTime();
  const diffMinutes = Math.round((exitMs - entryMs) / (1000 * 60));

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return `${hours}h ${mins}m`;
}
