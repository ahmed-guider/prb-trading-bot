/**
 * Focused ORB sweep around the best-performing configs:
 * - OR=30min (Sharpe 2.54, +18.4%)
 * - wide-OR-patient (Sharpe 1.74, +8.5%)
 *
 * Run with: npx tsx src/backtest/orb-focused-sweep.ts
 */

import "dotenv/config";
import { runORBBacktest, preloadORBData, type ORBParams } from "./orb-engine.js";

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
  openingRangeMinutes: 30,
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
  // --- Baseline (OR=30min winner) ---
  { label: "30min-baseline", overrides: {} },

  // --- OR width bounds around 30min ---
  { label: "30m-w0.1-1.0", overrides: { minORWidthPct: 0.1, maxORWidthPct: 1.0 } },
  { label: "30m-w0.2-1.5", overrides: { minORWidthPct: 0.2, maxORWidthPct: 1.5 } },
  { label: "30m-w0.2-2.0", overrides: { minORWidthPct: 0.2, maxORWidthPct: 2.0 } },
  { label: "30m-w0.3-2.0", overrides: { minORWidthPct: 0.3, maxORWidthPct: 2.0 } },
  { label: "30m-w0.3-3.0", overrides: { minORWidthPct: 0.3, maxORWidthPct: 3.0 } },

  // --- R-multiple targets with OR=30min ---
  { label: "30m-R0.5/1.0", overrides: { target1R: 0.5, target2R: 1.0 } },
  { label: "30m-R0.75/1.5", overrides: { target1R: 0.75, target2R: 1.5 } },
  { label: "30m-R1.0/2.0", overrides: { target1R: 1.0, target2R: 2.0 } },
  { label: "30m-R1.0/3.0", overrides: { target1R: 1.0, target2R: 3.0 } },
  { label: "30m-R1.5/3.0", overrides: { target1R: 1.5, target2R: 3.0 } },
  { label: "30m-R2.0/4.0", overrides: { target1R: 2.0, target2R: 4.0 } },

  // --- Time stop with OR=30min ---
  { label: "30m-ts11", overrides: { timeStopHour: 11 } },
  { label: "30m-ts12", overrides: { timeStopHour: 12 } },
  { label: "30m-ts13", overrides: { timeStopHour: 13 } },
  { label: "30m-ts14", overrides: { timeStopHour: 14 } },
  { label: "30m-ts15", overrides: { timeStopHour: 15 } },

  // --- Body ratio with OR=30min ---
  { label: "30m-body30", overrides: { breakoutBodyRatio: 0.3 } },
  { label: "30m-body40", overrides: { breakoutBodyRatio: 0.4 } },
  { label: "30m-body50", overrides: { breakoutBodyRatio: 0.5 } },
  { label: "30m-body60", overrides: { breakoutBodyRatio: 0.6 } },

  // --- Volume filter with OR=30min ---
  { label: "30m-vol0.5", overrides: { breakoutVolumeMultiplier: 0.5 } },
  { label: "30m-vol0.8", overrides: { breakoutVolumeMultiplier: 0.8 } },
  { label: "30m-vol1.0", overrides: { breakoutVolumeMultiplier: 1.0 } },
  { label: "30m-vol1.5", overrides: { breakoutVolumeMultiplier: 1.5 } },

  // --- Direction with OR=30min ---
  { label: "30m-long-only", overrides: { allowLong: true, allowShort: false } },
  { label: "30m-short-only", overrides: { allowLong: false, allowShort: true } },
  { label: "30m-both", overrides: { allowLong: true, allowShort: true } },

  // --- Trend filter with OR=30min ---
  { label: "30m-no-trend", overrides: { trendFilter: false } },
  { label: "30m-with-trend", overrides: { trendFilter: true } },

  // --- Risk per trade with OR=30min ---
  { label: "30m-risk1%", overrides: { riskPerTrade: 0.01 } },
  { label: "30m-risk2%", overrides: { riskPerTrade: 0.02 } },
  { label: "30m-risk3%", overrides: { riskPerTrade: 0.03 } },

  // --- Max positions with OR=30min ---
  { label: "30m-maxpos1", overrides: { maxPositions: 1 } },
  { label: "30m-maxpos2", overrides: { maxPositions: 2 } },
  { label: "30m-maxpos3", overrides: { maxPositions: 3 } },
  { label: "30m-maxpos5", overrides: { maxPositions: 5 } },

  // --- Stop buffer with OR=30min ---
  { label: "30m-sb0.05%", overrides: { stopBuffer: 0.0005 } },
  { label: "30m-sb0.1%", overrides: { stopBuffer: 0.001 } },
  { label: "30m-sb0.2%", overrides: { stopBuffer: 0.002 } },
  { label: "30m-sb0.5%", overrides: { stopBuffer: 0.005 } },

  // --- Combined presets ---
  {
    label: "best-combo-A",
    overrides: {
      openingRangeMinutes: 30,
      target1R: 1.0,
      target2R: 2.0,
      timeStopHour: 14,
      breakoutVolumeMultiplier: 0.8,
      maxPositions: 5,
      riskPerTrade: 0.02,
    },
  },
  {
    label: "best-combo-B",
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
    label: "best-combo-C",
    overrides: {
      openingRangeMinutes: 30,
      target1R: 0.75,
      target2R: 1.5,
      timeStopHour: 13,
      breakoutBodyRatio: 0.4,
      breakoutVolumeMultiplier: 0.8,
      riskPerTrade: 0.03,
      maxPositions: 5,
    },
  },
  {
    label: "best-combo-D",
    overrides: {
      openingRangeMinutes: 30,
      target1R: 2.0,
      target2R: 4.0,
      timeStopHour: 14,
      minORWidthPct: 0.2,
      maxORWidthPct: 1.5,
      breakoutVolumeMultiplier: 0.8,
      allowShort: false,
    },
  },
  {
    label: "best-combo-E",
    overrides: {
      openingRangeMinutes: 30,
      target1R: 1.0,
      target2R: 3.0,
      timeStopHour: 14,
      breakoutVolumeMultiplier: 0.8,
      riskPerTrade: 0.01,
      maxPositions: 5,
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
  console.log("ORB FOCUSED SWEEP (around OR=30min best configs)");
  console.log("=".repeat(80));
  console.log(`Combinations: ${sweepCombos.length}`);
  console.log(`Symbols: ${SYMBOLS.length}`);
  console.log(`Period: ${baseParams.startDate} to ${baseParams.endDate}`);
  console.log();

  console.log("Loading market data...\n");
  const preloaded = await preloadORBData(SYMBOLS, baseParams.startDate, baseParams.endDate);
  console.log("Data loaded. Running sweep...\n");

  const results: SweepResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < sweepCombos.length; i++) {
    const combo = sweepCombos[i];
    const params = { ...baseParams, ...combo.overrides };

    if (combo.overrides.symbols) {
      params.symbols = combo.overrides.symbols;
    }

    process.stdout.write(`[${i + 1}/${sweepCombos.length}] ${combo.label.padEnd(22)}  `);

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

  results.sort((a, b) => b.sharpe - a.sharpe);

  console.log();
  console.log("=".repeat(130));
  console.log("FOCUSED SWEEP RESULTS (sorted by Sharpe ratio)");
  console.log("=".repeat(130));
  console.log(
    "Rank".padEnd(5) +
    "Label".padEnd(24) +
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
  console.log("-".repeat(130));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const pnlStr = r.totalPnl >= 0 ? `+$${r.totalPnl.toFixed(0)}` : `-$${Math.abs(r.totalPnl).toFixed(0)}`;
    const pctStr = r.totalPnlPct >= 0 ? `+${r.totalPnlPct.toFixed(1)}%` : `${r.totalPnlPct.toFixed(1)}%`;

    console.log(
      `#${i + 1}`.padEnd(5) +
      r.label.padEnd(24) +
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

  // Show profitable configs only
  const profitable = results.filter((r) => r.totalPnl > 0);
  console.log();
  console.log(`PROFITABLE CONFIGS (${profitable.length}/${results.length}):`);
  for (let i = 0; i < profitable.length; i++) {
    const r = profitable[i];
    const pnlStr = `+$${r.totalPnl.toFixed(0)}`;
    console.log(
      `  ${i + 1}. ${r.label}: ${r.trades} trades, ` +
      `${(r.winRate * 100).toFixed(0)}% win, ${pnlStr} (+${r.totalPnlPct.toFixed(1)}%), ` +
      `Sharpe ${r.sharpe.toFixed(2)}, DD ${r.maxDrawdown.toFixed(1)}%`
    );
  }

  // Show top 5 by risk-adjusted return
  console.log();
  console.log("TOP 5 BY SHARPE:");
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i];
    const pnlStr = r.totalPnl >= 0 ? `+$${r.totalPnl.toFixed(0)}` : `-$${Math.abs(r.totalPnl).toFixed(0)}`;
    console.log(
      `  ${i + 1}. ${r.label}: Sharpe ${r.sharpe.toFixed(2)}, ` +
      `${r.trades} trades, ${(r.winRate * 100).toFixed(0)}% win, ` +
      `${pnlStr}, DD ${r.maxDrawdown.toFixed(1)}%`
    );
  }
}

main().catch((err) => {
  console.error("Focused sweep failed:", err);
  process.exit(1);
});
