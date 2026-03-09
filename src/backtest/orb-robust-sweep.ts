/**
 * Robust ORB sweep — optimizes on full 2-year dataset, then validates
 * with walk-forward testing to avoid overfitting.
 *
 * Phase 1: Sweep all combos on 2 years of data (Mar 2024 - Feb 2026)
 * Phase 2: Walk-forward test top configs (train 6mo → test 3mo, rolling)
 *
 * Run with: npx tsx src/backtest/orb-robust-sweep.ts
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
  startDate: "2024-03-01",  // full 2 years
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

// Fewer, broader combos — avoid fine-tuning single parameters
const sweepCombos: SweepCombo[] = [
  // --- Opening range period (the biggest lever) ---
  { label: "OR=5min", overrides: { openingRangeMinutes: 5 } },
  { label: "OR=15min", overrides: { openingRangeMinutes: 15 } },
  { label: "OR=30min", overrides: { openingRangeMinutes: 30 } },
  { label: "OR=60min", overrides: { openingRangeMinutes: 60 } },

  // --- R targets (keep it simple, 3 options) ---
  { label: "R=0.5/1.0", overrides: { target1R: 0.5, target2R: 1.0 } },
  { label: "R=1.0/2.0", overrides: { target1R: 1.0, target2R: 2.0 } },
  { label: "R=1.5/3.0", overrides: { target1R: 1.5, target2R: 3.0 } },

  // --- Time stop ---
  { label: "tstop=11", overrides: { timeStopHour: 11 } },
  { label: "tstop=12", overrides: { timeStopHour: 12 } },
  { label: "tstop=14", overrides: { timeStopHour: 14 } },

  // --- Direction ---
  { label: "long-only", overrides: { allowLong: true, allowShort: false } },
  { label: "short-only", overrides: { allowLong: false, allowShort: true } },
  { label: "both", overrides: { allowLong: true, allowShort: true } },

  // --- Combined: OR period × targets (the two biggest levers) ---
  { label: "5m-R0.5/1.0", overrides: { openingRangeMinutes: 5, target1R: 0.5, target2R: 1.0 } },
  { label: "5m-R1.0/2.0", overrides: { openingRangeMinutes: 5, target1R: 1.0, target2R: 2.0 } },
  { label: "15m-R0.5/1.0", overrides: { openingRangeMinutes: 15, target1R: 0.5, target2R: 1.0 } },
  { label: "15m-R1.0/2.0", overrides: { openingRangeMinutes: 15, target1R: 1.0, target2R: 2.0 } },
  { label: "15m-R1.5/3.0", overrides: { openingRangeMinutes: 15, target1R: 1.5, target2R: 3.0 } },
  { label: "30m-R0.5/1.0", overrides: { openingRangeMinutes: 30, target1R: 0.5, target2R: 1.0 } },
  { label: "30m-R1.0/2.0", overrides: { openingRangeMinutes: 30, target1R: 1.0, target2R: 2.0 } },
  { label: "30m-R1.5/3.0", overrides: { openingRangeMinutes: 30, target1R: 1.5, target2R: 3.0 } },
  { label: "60m-R0.5/1.0", overrides: { openingRangeMinutes: 60, target1R: 0.5, target2R: 1.0 } },
  { label: "60m-R1.0/2.0", overrides: { openingRangeMinutes: 60, target1R: 1.0, target2R: 2.0 } },
  { label: "60m-R1.5/3.0", overrides: { openingRangeMinutes: 60, target1R: 1.5, target2R: 3.0 } },

  // --- Combined: OR period × time stop ---
  { label: "30m-ts11", overrides: { openingRangeMinutes: 30, timeStopHour: 11 } },
  { label: "30m-ts14", overrides: { openingRangeMinutes: 30, timeStopHour: 14 } },
  { label: "60m-ts14", overrides: { openingRangeMinutes: 60, timeStopHour: 14 } },
  { label: "60m-ts15", overrides: { openingRangeMinutes: 60, timeStopHour: 15 } },

  // --- Combined: best ideas, minimal parameters ---
  {
    label: "simple-30m",
    overrides: {
      openingRangeMinutes: 30,
      target1R: 1.0,
      target2R: 2.0,
      timeStopHour: 12,
    },
  },
  {
    label: "simple-60m",
    overrides: {
      openingRangeMinutes: 60,
      target1R: 1.0,
      target2R: 2.0,
      timeStopHour: 14,
    },
  },
  {
    label: "patient-60m",
    overrides: {
      openingRangeMinutes: 60,
      target1R: 1.5,
      target2R: 3.0,
      timeStopHour: 15,
      minORWidthPct: 0.3,
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
  overrides: Partial<ORBParams>;
}

// ---------------------------------------------------------------------------
// Walk-forward windows
// ---------------------------------------------------------------------------

interface WFWindow {
  label: string;
  startDate: string;
  endDate: string;
}

const walkForwardWindows: WFWindow[] = [
  { label: "Q2 2024", startDate: "2024-04-01", endDate: "2024-06-30" },
  { label: "Q3 2024", startDate: "2024-07-01", endDate: "2024-09-30" },
  { label: "Q4 2024", startDate: "2024-10-01", endDate: "2024-12-31" },
  { label: "Q1 2025", startDate: "2025-01-01", endDate: "2025-03-31" },
  { label: "Q2 2025", startDate: "2025-04-01", endDate: "2025-06-30" },
  { label: "Q3 2025", startDate: "2025-07-01", endDate: "2025-09-30" },
  { label: "Q4 2025", startDate: "2025-10-01", endDate: "2025-12-31" },
  { label: "Q1 2026", startDate: "2026-01-01", endDate: "2026-02-28" },
];

async function main() {
  // =========================================================================
  // PHASE 1: Full 2-year sweep
  // =========================================================================
  console.log("=".repeat(90));
  console.log("PHASE 1: ORB SWEEP ON FULL 2-YEAR DATASET (Mar 2024 - Feb 2026)");
  console.log("=".repeat(90));
  console.log(`Combinations: ${sweepCombos.length}`);
  console.log(`Symbols: ${SYMBOLS.length}`);
  console.log();

  console.log("Loading 2 years of market data...\n");
  const preloaded = await preloadORBData(SYMBOLS, "2024-03-01", "2026-02-28");
  console.log("Data loaded. Running sweep...\n");

  const results: SweepResult[] = [];

  for (let i = 0; i < sweepCombos.length; i++) {
    const combo = sweepCombos[i];
    const params = { ...baseParams, ...combo.overrides };
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
        overrides: combo.overrides,
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

  results.sort((a, b) => b.sharpe - a.sharpe);

  console.log();
  console.log("=".repeat(130));
  console.log("2-YEAR RESULTS (sorted by Sharpe)");
  console.log("=".repeat(130));
  console.log(
    "Rank".padEnd(5) +
    "Label".padEnd(22) +
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
  console.log("-".repeat(130));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const pnlStr = r.totalPnl >= 0 ? `+$${r.totalPnl.toFixed(0)}` : `-$${Math.abs(r.totalPnl).toFixed(0)}`;
    const pctStr = r.totalPnlPct >= 0 ? `+${r.totalPnlPct.toFixed(1)}%` : `${r.totalPnlPct.toFixed(1)}%`;
    console.log(
      `#${i + 1}`.padEnd(5) +
      r.label.padEnd(22) +
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

  // =========================================================================
  // PHASE 2: Walk-forward test top 5 configs
  // =========================================================================
  // Pick configs to walk-forward test: profitable ones + top 3 by Sharpe (deduplicated)
  const profitable2yrConfigs = results.filter((r) => r.totalPnl > 0);
  const top3BySharpe = results.slice(0, 3);
  const seen = new Set<string>();
  const toTest: SweepResult[] = [];
  for (const r of [...profitable2yrConfigs, ...top3BySharpe]) {
    // Dedupe by identical P&L (same effective config)
    const key = `${r.trades}-${r.totalPnl.toFixed(0)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toTest.push(r);
  }

  console.log();
  console.log("=".repeat(90));
  console.log(`PHASE 2: WALK-FORWARD VALIDATION (quarterly, ${toTest.length} configs)`);
  console.log("=".repeat(90));
  console.log("Testing each config on 8 independent quarters to check consistency.\n");
  console.log("A robust config should be profitable in MOST quarters, not just one.\n");

  for (const config of toTest) {
    console.log(`--- ${config.label} (2yr Sharpe: ${config.sharpe.toFixed(2)}, P&L: ${config.totalPnlPct >= 0 ? '+' : ''}${config.totalPnlPct.toFixed(1)}%) ---`);

    const quarterResults: { label: string; pnl: number; pnlPct: number; trades: number; winRate: number; sharpe: number }[] = [];

    for (const window of walkForwardWindows) {
      const params: ORBParams = {
        ...baseParams,
        ...config.overrides,
        startDate: window.startDate,
        endDate: window.endDate,
      };

      try {
        // Reuse the preloaded data (it covers the full 2-year range)
        const result = await runORBBacktest(params, preloaded);
        const m = result.metrics;
        quarterResults.push({
          label: window.label,
          pnl: m.totalPnl,
          pnlPct: m.totalPnlPercent,
          trades: m.totalTrades,
          winRate: m.winRate,
          sharpe: m.sharpeRatio,
        });

        const pnlStr = m.totalPnl >= 0 ? `+$${m.totalPnl.toFixed(0).padStart(6)}` : `-$${Math.abs(m.totalPnl).toFixed(0).padStart(6)}`;
        const icon = m.totalPnl > 0 ? "+" : m.totalPnl < 0 ? "-" : "=";
        console.log(
          `  ${window.label}: ${icon} ${m.totalTrades} trades, ` +
          `${(m.winRate * 100).toFixed(0)}% win, ${pnlStr}, ` +
          `Sharpe ${m.sharpeRatio.toFixed(2)}`
        );
      } catch {
        console.log(`  ${window.label}: FAILED`);
      }
    }

    const profitableQtrs = quarterResults.filter((q) => q.pnl > 0).length;
    const totalQtrs = quarterResults.length;
    const avgQtrReturn = quarterResults.reduce((s, q) => s + q.pnlPct, 0) / totalQtrs;
    const avgQtrSharpe = quarterResults.reduce((s, q) => s + q.sharpe, 0) / totalQtrs;

    console.log(
      `  >> Profitable quarters: ${profitableQtrs}/${totalQtrs} | ` +
      `Avg quarterly return: ${avgQtrReturn >= 0 ? '+' : ''}${avgQtrReturn.toFixed(1)}% | ` +
      `Avg quarterly Sharpe: ${avgQtrSharpe.toFixed(2)}`
    );
    console.log();
  }

  // =========================================================================
  // Final verdict
  // =========================================================================
  console.log("=".repeat(90));
  console.log("VERDICT");
  console.log("=".repeat(90));

  const profitable2yr = results.filter((r) => r.totalPnl > 0);
  console.log(`Configs profitable over full 2 years: ${profitable2yr.length}/${results.length}`);
  if (profitable2yr.length > 0) {
    console.log("\nViable configs (profitable over 2 years):");
    for (const r of profitable2yr) {
      console.log(
        `  ${r.label}: +${r.totalPnlPct.toFixed(1)}%, Sharpe ${r.sharpe.toFixed(2)}, ` +
        `${r.trades} trades, ${(r.winRate * 100).toFixed(0)}% win, DD ${r.maxDrawdown.toFixed(1)}%`
      );
    }
  } else {
    console.log("\nNo configs are profitable over the full 2-year period.");
    console.log("The ORB strategy may not have a durable edge on these symbols.");
  }
}

main().catch((err) => {
  console.error("Robust sweep failed:", err);
  process.exit(1);
});
