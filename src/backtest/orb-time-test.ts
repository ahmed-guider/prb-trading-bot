/**
 * Test the best ORB config across multiple time periods to check robustness.
 *
 * Run with: npx tsx src/backtest/orb-time-test.ts
 */

import "dotenv/config";
import { runORBBacktest, preloadORBData, type ORBParams } from "./orb-engine.js";

const SYMBOLS = [
  "SPY", "QQQ",
  "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META",
  "TSLA", "AMD", "NFLX", "AVGO", "CRM", "PLTR",
];

// Best config: OR=30min, time stop 11 AM
const bestConfig: Omit<ORBParams, "startDate" | "endDate"> = {
  symbols: SYMBOLS,
  initialBalance: 100_000,
  openingRangeMinutes: 30,
  minORWidthPct: 0.2,
  maxORWidthPct: 2.0,
  breakoutBodyRatio: 0.5,
  breakoutVolumeMultiplier: 1.0,
  target1R: 1.0,
  target2R: 2.0,
  stopBuffer: 0.001,
  timeStopHour: 11,
  maxPositions: 3,
  riskPerTrade: 0.02,
  trendFilter: false,
  trendEmaFast: 20,
  trendEmaSlow: 50,
  allowLong: true,
  allowShort: true,
};

interface TimePeriod {
  label: string;
  startDate: string;
  endDate: string;
}

const periods: TimePeriod[] = [
  // Original test period
  { label: "Sep 2025 - Feb 2026 (original)", startDate: "2025-09-01", endDate: "2026-02-28" },
  // 6 months before
  { label: "Mar 2025 - Aug 2025", startDate: "2025-03-01", endDate: "2025-08-31" },
  // 1 year ago
  { label: "Sep 2024 - Feb 2025", startDate: "2024-09-01", endDate: "2025-02-28" },
  // 18 months ago
  { label: "Mar 2024 - Aug 2024", startDate: "2024-03-01", endDate: "2024-08-31" },
  // 2 years ago
  { label: "Sep 2023 - Feb 2024", startDate: "2023-09-01", endDate: "2024-02-28" },
  // Full year tests
  { label: "Full 2025 (Jan-Dec)", startDate: "2025-01-01", endDate: "2025-12-31" },
  { label: "Full 2024 (Jan-Dec)", startDate: "2024-01-01", endDate: "2024-12-31" },
  // Longest backtest possible
  { label: "2 years (Mar 2024 - Feb 2026)", startDate: "2024-03-01", endDate: "2026-02-28" },
];

interface PeriodResult {
  label: string;
  startDate: string;
  endDate: string;
  trades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpe: number;
  avgWin: number;
  avgLoss: number;
  tradingDays: number;
}

async function main() {
  console.log("=".repeat(90));
  console.log("ORB STRATEGY — MULTI-PERIOD ROBUSTNESS TEST");
  console.log("=".repeat(90));
  console.log("Config: OR=30min, R=1.0/2.0, Time Stop 11 AM, 2% risk, both long+short");
  console.log(`Symbols: ${SYMBOLS.join(", ")}`);
  console.log(`Testing ${periods.length} time periods\n`);

  const results: PeriodResult[] = [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    console.log(`[${i + 1}/${periods.length}] ${period.label}`);
    console.log(`  Loading data for ${period.startDate} to ${period.endDate}...`);

    try {
      const params: ORBParams = {
        ...bestConfig,
        startDate: period.startDate,
        endDate: period.endDate,
      };

      const preloaded = await preloadORBData(SYMBOLS, period.startDate, period.endDate);
      const result = await runORBBacktest(params, preloaded);
      const m = result.metrics;

      const r: PeriodResult = {
        label: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        trades: m.totalTrades,
        winRate: m.winRate,
        totalPnl: m.totalPnl,
        totalPnlPct: m.totalPnlPercent,
        profitFactor: m.profitFactor,
        maxDrawdown: m.maxDrawdownPercent,
        sharpe: m.sharpeRatio,
        avgWin: m.avgWin,
        avgLoss: m.avgLoss,
        tradingDays: result.equityCurve.length,
      };
      results.push(r);

      const pnlStr = m.totalPnl >= 0 ? `+$${m.totalPnl.toFixed(0)}` : `-$${Math.abs(m.totalPnl).toFixed(0)}`;
      console.log(
        `  → ${m.totalTrades} trades over ${r.tradingDays} days | ` +
        `Win: ${(m.winRate * 100).toFixed(0)}% | P&L: ${pnlStr} (${m.totalPnlPercent >= 0 ? "+" : ""}${m.totalPnlPercent.toFixed(1)}%) | ` +
        `Sharpe: ${m.sharpeRatio.toFixed(2)} | DD: ${m.maxDrawdownPercent.toFixed(1)}%\n`
      );
    } catch (err) {
      console.log(`  → FAILED: ${err}\n`);
    }
  }

  // Results table
  console.log("=".repeat(140));
  console.log("MULTI-PERIOD RESULTS");
  console.log("=".repeat(140));
  console.log(
    "Period".padEnd(38) +
    "Days".padEnd(6) +
    "Trades".padEnd(8) +
    "Win%".padEnd(7) +
    "P&L".padEnd(13) +
    "P&L%".padEnd(9) +
    "PF".padEnd(7) +
    "Sharpe".padEnd(8) +
    "MaxDD%".padEnd(8) +
    "AvgWin".padEnd(10) +
    "AvgLoss".padEnd(10)
  );
  console.log("-".repeat(140));

  for (const r of results) {
    const pnlStr = r.totalPnl >= 0 ? `+$${r.totalPnl.toFixed(0)}` : `-$${Math.abs(r.totalPnl).toFixed(0)}`;
    const pctStr = r.totalPnlPct >= 0 ? `+${r.totalPnlPct.toFixed(1)}%` : `${r.totalPnlPct.toFixed(1)}%`;

    console.log(
      r.label.padEnd(38) +
      `${r.tradingDays}`.padEnd(6) +
      `${r.trades}`.padEnd(8) +
      `${(r.winRate * 100).toFixed(0)}%`.padEnd(7) +
      pnlStr.padEnd(13) +
      pctStr.padEnd(9) +
      r.profitFactor.toFixed(2).padEnd(7) +
      r.sharpe.toFixed(2).padEnd(8) +
      `${r.maxDrawdown.toFixed(1)}%`.padEnd(8) +
      `$${r.avgWin.toFixed(0)}`.padEnd(10) +
      `$${r.avgLoss.toFixed(0)}`.padEnd(10)
    );
  }

  // Summary stats
  const profitable = results.filter((r) => r.totalPnl > 0);
  const avgSharpe = results.reduce((s, r) => s + r.sharpe, 0) / results.length;
  const avgWinRate = results.reduce((s, r) => s + r.winRate, 0) / results.length;
  const avgReturn = results.reduce((s, r) => s + r.totalPnlPct, 0) / results.length;

  console.log();
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Profitable periods: ${profitable.length}/${results.length}`);
  console.log(`Avg Sharpe: ${avgSharpe.toFixed(2)}`);
  console.log(`Avg Win Rate: ${(avgWinRate * 100).toFixed(1)}%`);
  console.log(`Avg Return: ${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}%`);
  console.log(`Best period: ${results.sort((a, b) => b.sharpe - a.sharpe)[0]?.label}`);
  console.log(`Worst period: ${results.sort((a, b) => a.sharpe - b.sharpe)[0]?.label}`);
}

main().catch((err) => {
  console.error("Time test failed:", err);
  process.exit(1);
});
