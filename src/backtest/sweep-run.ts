/**
 * Parameter sweep runner — tests multiple parameter combinations
 * to find optimal PRB strategy settings.
 *
 * Run with: npx tsx src/backtest/sweep-run.ts
 */

import "dotenv/config";
import { runBacktest, preloadData, type BacktestParams } from "./engine.js";

const TEST_SYMBOLS = [
  "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META",
  "JPM", "V", "MA", "HD", "COST", "AVGO", "NFLX",
  "AMD", "CRM", "UBER", "NOW",
];

const baseParams: BacktestParams = {
  symbols: TEST_SYMBOLS,
  startDate: "2025-09-01",
  endDate: "2026-02-28",
  initialBalance: 100_000,
  gapThreshold: 1.5,
  trendEmaFast: 20,
  trendEmaSlow: 50,
  momentumBodyRatio: 0.5,
  momentumWickMax: 0.3,
  scaleOut1: 1,
  scaleOut2: 2,
  scaleOut3: 3,
  stopLossBuffer: 0.002,
  maxPositions: 3,
  riskPerTrade: 0.02,
  dailyLossLimit: 0.05,
  leverageMultiplier: 10,
  timeStopHour: 11,
};

// Define sweep parameter combinations
interface SweepCombo {
  label: string;
  overrides: Partial<BacktestParams>;
}

const sweepCombos: SweepCombo[] = [
  // Vary gap threshold
  { label: "gap=1.0%", overrides: { gapThreshold: 1.0 } },
  { label: "gap=1.5%", overrides: { gapThreshold: 1.5 } },
  { label: "gap=2.0%", overrides: { gapThreshold: 2.0 } },
  { label: "gap=2.5%", overrides: { gapThreshold: 2.5 } },

  // Vary scale-out targets (tighter)
  { label: "scale=0.3/0.5/1.0", overrides: { scaleOut1: 0.3, scaleOut2: 0.5, scaleOut3: 1.0 } },
  { label: "scale=0.5/1.0/1.5", overrides: { scaleOut1: 0.5, scaleOut2: 1.0, scaleOut3: 1.5 } },
  { label: "scale=0.5/1.0/2.0", overrides: { scaleOut1: 0.5, scaleOut2: 1.0, scaleOut3: 2.0 } },
  { label: "scale=1.0/2.0/3.0", overrides: { scaleOut1: 1.0, scaleOut2: 2.0, scaleOut3: 3.0 } },

  // Vary momentum candle strictness
  { label: "mom=40%/35%", overrides: { momentumBodyRatio: 0.4, momentumWickMax: 0.35 } },
  { label: "mom=50%/30%", overrides: { momentumBodyRatio: 0.5, momentumWickMax: 0.3 } },
  { label: "mom=60%/20%", overrides: { momentumBodyRatio: 0.6, momentumWickMax: 0.2 } },

  // Vary time stop
  { label: "tstop=10:00", overrides: { timeStopHour: 10 } },
  { label: "tstop=11:00", overrides: { timeStopHour: 11 } },
  { label: "tstop=12:00", overrides: { timeStopHour: 12 } },
  { label: "tstop=14:00", overrides: { timeStopHour: 14 } },

  // Vary stop loss buffer
  { label: "sl=0.1%", overrides: { stopLossBuffer: 0.001 } },
  { label: "sl=0.2%", overrides: { stopLossBuffer: 0.002 } },
  { label: "sl=0.5%", overrides: { stopLossBuffer: 0.005 } },
  { label: "sl=1.0%", overrides: { stopLossBuffer: 0.01 } },

  // Vary risk per trade
  { label: "risk=1%", overrides: { riskPerTrade: 0.01 } },
  { label: "risk=2%", overrides: { riskPerTrade: 0.02 } },
  { label: "risk=3%", overrides: { riskPerTrade: 0.03 } },
  { label: "risk=5%", overrides: { riskPerTrade: 0.05 } },

  // Combined "aggressive" preset
  {
    label: "aggressive",
    overrides: {
      gapThreshold: 1.0,
      momentumBodyRatio: 0.4,
      momentumWickMax: 0.35,
      scaleOut1: 0.3,
      scaleOut2: 0.7,
      scaleOut3: 1.5,
      stopLossBuffer: 0.005,
      riskPerTrade: 0.03,
      timeStopHour: 12,
    },
  },

  // Combined "conservative" preset
  {
    label: "conservative",
    overrides: {
      gapThreshold: 2.0,
      momentumBodyRatio: 0.6,
      momentumWickMax: 0.2,
      scaleOut1: 0.5,
      scaleOut2: 1.0,
      scaleOut3: 2.0,
      stopLossBuffer: 0.003,
      riskPerTrade: 0.01,
      timeStopHour: 11,
    },
  },

  // Combined "tight scalp"
  {
    label: "tight-scalp",
    overrides: {
      gapThreshold: 1.0,
      momentumBodyRatio: 0.4,
      momentumWickMax: 0.35,
      scaleOut1: 0.2,
      scaleOut2: 0.4,
      scaleOut3: 0.7,
      stopLossBuffer: 0.003,
      riskPerTrade: 0.03,
      timeStopHour: 10,
    },
  },

  // Combined "wide targets"
  {
    label: "wide-targets",
    overrides: {
      gapThreshold: 1.5,
      momentumBodyRatio: 0.5,
      momentumWickMax: 0.3,
      scaleOut1: 1.0,
      scaleOut2: 2.0,
      scaleOut3: 4.0,
      stopLossBuffer: 0.005,
      riskPerTrade: 0.02,
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
  bestTrade: number;
  worstTrade: number;
}

async function main() {
  console.log("=".repeat(80));
  console.log("PRB STRATEGY PARAMETER SWEEP");
  console.log("=".repeat(80));
  console.log(`Combinations: ${sweepCombos.length}`);
  console.log(`Symbols: ${TEST_SYMBOLS.length}`);
  console.log(`Period: ${baseParams.startDate} to ${baseParams.endDate}`);
  console.log();

  // Preload data once — all sweep runs reuse the same data
  console.log("Loading market data (this takes ~90s on first run)...\n");
  const preloaded = await preloadData(TEST_SYMBOLS, baseParams.startDate, baseParams.endDate);
  console.log("Data loaded. Running sweep...\n");

  const results: SweepResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < sweepCombos.length; i++) {
    const combo = sweepCombos[i];
    const params = { ...baseParams, ...combo.overrides };

    console.log(`[${i + 1}/${sweepCombos.length}] Running: ${combo.label}...`);

    try {
      const result = await runBacktest(params, preloaded);
      const m = result.metrics;

      const sr: SweepResult = {
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
        bestTrade: m.bestTrade,
        worstTrade: m.worstTrade,
      };

      results.push(sr);

      console.log(
        `  → ${m.totalTrades} trades | Win: ${(m.winRate * 100).toFixed(0)}% | ` +
        `P&L: $${m.totalPnl.toFixed(0)} (${m.totalPnlPercent.toFixed(1)}%) | ` +
        `PF: ${m.profitFactor.toFixed(2)} | Sharpe: ${m.sharpeRatio.toFixed(2)} | ` +
        `DD: ${m.maxDrawdownPercent.toFixed(1)}%`
      );
    } catch (err) {
      console.log(`  → FAILED: ${err}`);
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

  // Highlight best
  if (results.length > 0) {
    const best = results[0];
    console.log();
    console.log("BEST CONFIG: " + best.label);
    console.log(`  Trades: ${best.trades} | Win: ${(best.winRate * 100).toFixed(0)}% | P&L: $${best.totalPnl.toFixed(2)} | Sharpe: ${best.sharpe.toFixed(2)}`);
  }
}

main().catch((err) => {
  console.error("Sweep failed:", err);
  process.exit(1);
});
