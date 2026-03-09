/**
 * ORB (Opening Range Breakout) backtest runner + parameter sweep.
 *
 * Run with: npx tsx src/backtest/orb-run.ts
 */

import "dotenv/config";
import { runORBBacktest, preloadORBData, type ORBParams } from "./orb-engine.js";

// Trade SPY, QQQ, and top liquid stocks
const SYMBOLS = [
  "SPY", "QQQ",
  "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META",
  "TSLA", "AMD", "NFLX", "AVGO", "CRM", "PLTR",
];

const baseParams: ORBParams = {
  symbols: SYMBOLS,
  startDate: "2025-09-01",
  endDate: "2026-02-28",
  initialBalance: 100_000,
  openingRangeMinutes: 15,
  minORWidthPct: 0.2,
  maxORWidthPct: 2.0,
  breakoutBodyRatio: 0.5,
  breakoutVolumeMultiplier: 1.0,
  target1R: 1.0,
  target2R: 2.0,
  stopBuffer: 0.001,
  timeStopHour: 12,
  maxPositions: 3,
  riskPerTrade: 0.02,
  trendFilter: false,
  trendEmaFast: 20,
  trendEmaSlow: 50,
  allowLong: true,
  allowShort: true,
};

interface SweepCombo {
  label: string;
  overrides: Partial<ORBParams>;
}

const sweepCombos: SweepCombo[] = [
  // Baseline
  { label: "baseline", overrides: {} },

  // OR period
  { label: "OR=5min", overrides: { openingRangeMinutes: 5 } },
  { label: "OR=15min", overrides: { openingRangeMinutes: 15 } },
  { label: "OR=30min", overrides: { openingRangeMinutes: 30 } },

  // OR width bounds
  { label: "width=0.1-1.0", overrides: { minORWidthPct: 0.1, maxORWidthPct: 1.0 } },
  { label: "width=0.2-2.0", overrides: { minORWidthPct: 0.2, maxORWidthPct: 2.0 } },
  { label: "width=0.3-3.0", overrides: { minORWidthPct: 0.3, maxORWidthPct: 3.0 } },

  // R-multiple targets
  { label: "R=0.5/1.0", overrides: { target1R: 0.5, target2R: 1.0 } },
  { label: "R=1.0/2.0", overrides: { target1R: 1.0, target2R: 2.0 } },
  { label: "R=1.5/3.0", overrides: { target1R: 1.5, target2R: 3.0 } },
  { label: "R=2.0/4.0", overrides: { target1R: 2.0, target2R: 4.0 } },

  // Breakout confirmation
  { label: "body=30%", overrides: { breakoutBodyRatio: 0.3 } },
  { label: "body=50%", overrides: { breakoutBodyRatio: 0.5 } },
  { label: "body=60%", overrides: { breakoutBodyRatio: 0.6 } },

  // Volume filter
  { label: "vol=0.8x", overrides: { breakoutVolumeMultiplier: 0.8 } },
  { label: "vol=1.0x", overrides: { breakoutVolumeMultiplier: 1.0 } },
  { label: "vol=1.5x", overrides: { breakoutVolumeMultiplier: 1.5 } },

  // Time stop
  { label: "tstop=11am", overrides: { timeStopHour: 11 } },
  { label: "tstop=12pm", overrides: { timeStopHour: 12 } },
  { label: "tstop=14pm", overrides: { timeStopHour: 14 } },
  { label: "tstop=15pm", overrides: { timeStopHour: 15 } },

  // Direction
  { label: "long-only", overrides: { allowLong: true, allowShort: false } },
  { label: "short-only", overrides: { allowLong: false, allowShort: true } },
  { label: "both", overrides: { allowLong: true, allowShort: true } },

  // Trend filter
  { label: "no-trend", overrides: { trendFilter: false } },
  { label: "with-trend", overrides: { trendFilter: true } },

  // Risk
  { label: "risk=1%", overrides: { riskPerTrade: 0.01 } },
  { label: "risk=2%", overrides: { riskPerTrade: 0.02 } },
  { label: "risk=3%", overrides: { riskPerTrade: 0.03 } },

  // Max positions
  { label: "maxpos=1", overrides: { maxPositions: 1 } },
  { label: "maxpos=3", overrides: { maxPositions: 3 } },
  { label: "maxpos=5", overrides: { maxPositions: 5 } },

  // Combined presets
  {
    label: "tight-scalp",
    overrides: {
      openingRangeMinutes: 5,
      target1R: 0.5,
      target2R: 1.0,
      timeStopHour: 11,
      breakoutBodyRatio: 0.3,
      breakoutVolumeMultiplier: 0.8,
      maxPositions: 5,
    },
  },
  {
    label: "classic-ORB",
    overrides: {
      openingRangeMinutes: 15,
      target1R: 1.0,
      target2R: 2.0,
      timeStopHour: 12,
      breakoutBodyRatio: 0.5,
      trendFilter: true,
    },
  },
  {
    label: "wide-OR-patient",
    overrides: {
      openingRangeMinutes: 30,
      target1R: 1.5,
      target2R: 3.0,
      timeStopHour: 15,
      minORWidthPct: 0.3,
      maxORWidthPct: 2.0,
      trendFilter: true,
    },
  },
  {
    label: "SPY-only",
    overrides: {
      symbols: ["SPY"],
      openingRangeMinutes: 15,
      target1R: 1.0,
      target2R: 2.0,
      timeStopHour: 14,
      maxPositions: 1,
      riskPerTrade: 0.03,
    },
  },
  {
    label: "aggressive",
    overrides: {
      openingRangeMinutes: 5,
      target1R: 0.5,
      target2R: 1.5,
      breakoutBodyRatio: 0.3,
      breakoutVolumeMultiplier: 0.8,
      riskPerTrade: 0.03,
      maxPositions: 5,
      timeStopHour: 14,
    },
  },
];

interface SweepResult {
  label: string;
  trades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpe: number;
  avgWin: number;
  avgLoss: number;
}

async function main() {
  console.log("=".repeat(80));
  console.log("ORB STRATEGY BACKTEST + PARAMETER SWEEP");
  console.log("=".repeat(80));
  console.log(`Combinations: ${sweepCombos.length}`);
  console.log(`Symbols: ${SYMBOLS.length}`);
  console.log(`Period: ${baseParams.startDate} to ${baseParams.endDate}`);
  console.log();

  // Preload data once
  console.log("Loading market data...\n");
  const preloaded = await preloadORBData(SYMBOLS, baseParams.startDate, baseParams.endDate);
  console.log("Data loaded. Running sweep...\n");

  const results: SweepResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < sweepCombos.length; i++) {
    const combo = sweepCombos[i];
    const params = { ...baseParams, ...combo.overrides };

    // Handle symbols override (for SPY-only)
    if (combo.overrides.symbols) {
      params.symbols = combo.overrides.symbols;
    }

    process.stdout.write(`[${i + 1}/${sweepCombos.length}] ${combo.label.padEnd(20)}  `);

    try {
      const result = await runORBBacktest(params, preloaded);
      const m = result.metrics;

      results.push({
        label: combo.label,
        trades: m.totalTrades,
        winRate: m.winRate,
        totalPnl: m.totalPnl,
        totalPnlPct: m.totalPnlPercent,
        profitFactor: m.profitFactor,
        maxDrawdown: m.maxDrawdownPercent,
        sharpe: m.sharpeRatio,
        avgWin: m.avgWin,
        avgLoss: m.avgLoss,
      });

      const pnlStr = m.totalPnl >= 0 ? `+$${m.totalPnl.toFixed(0)}` : `-$${Math.abs(m.totalPnl).toFixed(0)}`;
      console.log(
        `${m.totalTrades} trades | Win: ${(m.winRate * 100).toFixed(0)}% | ` +
        `P&L: ${pnlStr} (${m.totalPnlPercent >= 0 ? '+' : ''}${m.totalPnlPercent.toFixed(1)}%) | ` +
        `PF: ${m.profitFactor.toFixed(2)} | Sharpe: ${m.sharpeRatio.toFixed(2)} | ` +
        `DD: ${m.maxDrawdownPercent.toFixed(1)}%`
      );
    } catch (err) {
      console.log(`FAILED: ${err}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  // Sort by Sharpe ratio descending
  results.sort((a, b) => b.sharpe - a.sharpe);

  console.log();
  console.log("=".repeat(120));
  console.log("SWEEP RESULTS (sorted by Sharpe ratio)");
  console.log("=".repeat(120));
  console.log(
    "Rank".padEnd(5) +
    "Label".padEnd(22) +
    "Trades".padEnd(8) +
    "Win%".padEnd(7) +
    "P&L".padEnd(12) +
    "P&L%".padEnd(8) +
    "PF".padEnd(7) +
    "Sharpe".padEnd(8) +
    "MaxDD%".padEnd(8) +
    "AvgWin".padEnd(10) +
    "AvgLoss".padEnd(10)
  );
  console.log("-".repeat(120));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const pnlStr = r.totalPnl >= 0 ? `+$${r.totalPnl.toFixed(0)}` : `-$${Math.abs(r.totalPnl).toFixed(0)}`;
    const pctStr = r.totalPnlPct >= 0 ? `+${r.totalPnlPct.toFixed(1)}%` : `${r.totalPnlPct.toFixed(1)}%`;

    console.log(
      `#${i + 1}`.padEnd(5) +
      r.label.padEnd(22) +
      `${r.trades}`.padEnd(8) +
      `${(r.winRate * 100).toFixed(0)}%`.padEnd(7) +
      pnlStr.padEnd(12) +
      pctStr.padEnd(8) +
      r.profitFactor.toFixed(2).padEnd(7) +
      r.sharpe.toFixed(2).padEnd(8) +
      `${r.maxDrawdown.toFixed(1)}%`.padEnd(8) +
      `$${r.avgWin.toFixed(0)}`.padEnd(10) +
      `$${r.avgLoss.toFixed(0)}`.padEnd(10)
    );
  }

  console.log();
  console.log(`Sweep completed in ${elapsed}s`);

  // Show top 5
  console.log();
  console.log("TOP 5 CONFIGS:");
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i];
    const pnlStr = r.totalPnl >= 0 ? `+$${r.totalPnl.toFixed(0)}` : `-$${Math.abs(r.totalPnl).toFixed(0)}`;
    console.log(`  ${i + 1}. ${r.label}: ${r.trades} trades, ${(r.winRate * 100).toFixed(0)}% win, ${pnlStr}, Sharpe ${r.sharpe.toFixed(2)}`);
  }
}

main().catch((err) => {
  console.error("ORB sweep failed:", err);
  process.exit(1);
});
