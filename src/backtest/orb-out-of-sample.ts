/**
 * TRUE out-of-sample test for the ORB strategy.
 *
 * Tests the winning config (30m OR, R=1.5/3.0) on data we NEVER
 * used during optimization: 2022 and 2023.
 *
 * If this works → the edge is likely real.
 * If this fails → we overfitted on 2024-2026.
 *
 * Run with: npx tsx src/backtest/orb-out-of-sample.ts
 */

import "dotenv/config";
import { runORBBacktest, preloadORBData, type ORBParams } from "./orb-engine.js";

const SYMBOLS = [
  "SPY", "QQQ",
  "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META",
  "TSLA", "AMD", "NFLX", "AVGO", "CRM", "PLTR",
];

// The config we're testing — chosen from 2024-2026 optimization
const config: Omit<ORBParams, "startDate" | "endDate"> = {
  symbols: SYMBOLS,
  initialBalance: 100_000,
  openingRangeMinutes: 30,
  minORWidthPct: 0.2,
  maxORWidthPct: 2.0,
  breakoutBodyRatio: 0.5,
  breakoutVolumeMultiplier: 1.0,
  target1R: 1.5,
  target2R: 3.0,
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

interface TestPeriod {
  label: string;
  startDate: string;
  endDate: string;
  type: "out-of-sample" | "in-sample";
}

const periods: TestPeriod[] = [
  // TRUE OUT-OF-SAMPLE — never seen during any optimization
  { label: "2022 H1 (Jan-Jun)", startDate: "2022-01-01", endDate: "2022-06-30", type: "out-of-sample" },
  { label: "2022 H2 (Jul-Dec)", startDate: "2022-07-01", endDate: "2022-12-31", type: "out-of-sample" },
  { label: "2023 H1 (Jan-Jun)", startDate: "2023-01-01", endDate: "2023-06-30", type: "out-of-sample" },
  { label: "2023 H2 (Jul-Dec)", startDate: "2023-07-01", endDate: "2023-12-31", type: "out-of-sample" },
  { label: "Full 2022", startDate: "2022-01-01", endDate: "2022-12-31", type: "out-of-sample" },
  { label: "Full 2023", startDate: "2023-01-01", endDate: "2023-12-31", type: "out-of-sample" },

  // IN-SAMPLE — for comparison (this is what we optimized on)
  { label: "Full 2024 (in-sample)", startDate: "2024-01-01", endDate: "2024-12-31", type: "in-sample" },
  { label: "Full 2025 (in-sample)", startDate: "2025-01-01", endDate: "2025-12-31", type: "in-sample" },
  { label: "2024-2026 (in-sample)", startDate: "2024-03-01", endDate: "2026-02-28", type: "in-sample" },

  // FULL HISTORY — ultimate test
  { label: "FULL 4yr (2022-2026)", startDate: "2022-01-01", endDate: "2026-02-28", type: "out-of-sample" },
];

async function main() {
  console.log("=".repeat(90));
  console.log("TRUE OUT-OF-SAMPLE TEST");
  console.log("=".repeat(90));
  console.log("Config: OR=30min, R=1.5/3.0, Time Stop 12 PM (chosen from 2024-2026 optimization)");
  console.log("Testing on 2022-2023 data that was NEVER used during optimization.\n");
  console.log("If out-of-sample results match in-sample → edge is real.");
  console.log("If out-of-sample fails → we overfitted.\n");

  // Preload all data (2022-2026)
  console.log("Loading 4 years of market data...\n");
  const preloaded = await preloadORBData(SYMBOLS, "2022-01-01", "2026-02-28");
  console.log("Data loaded.\n");

  const results: {
    label: string;
    type: string;
    trades: number;
    winRate: number;
    pnl: number;
    pnlPct: number;
    pf: number;
    sharpe: number;
    dd: number;
    avgWin: number;
    avgLoss: number;
    days: number;
  }[] = [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const tag = period.type === "out-of-sample" ? "OOS" : " IS";
    process.stdout.write(`[${tag}] ${period.label.padEnd(30)} `);

    try {
      const params: ORBParams = {
        ...config,
        startDate: period.startDate,
        endDate: period.endDate,
      };

      const result = await runORBBacktest(params, preloaded);
      const m = result.metrics;

      results.push({
        label: period.label,
        type: period.type,
        trades: m.totalTrades,
        winRate: m.winRate,
        pnl: m.totalPnl,
        pnlPct: m.totalPnlPercent,
        pf: m.profitFactor,
        sharpe: m.sharpeRatio,
        dd: m.maxDrawdownPercent,
        avgWin: m.avgWin,
        avgLoss: m.avgLoss,
        days: result.equityCurve.length,
      });

      const pnlStr = m.totalPnl >= 0 ? `+$${m.totalPnl.toFixed(0)}` : `-$${Math.abs(m.totalPnl).toFixed(0)}`;
      console.log(
        `${m.totalTrades} trades / ${result.equityCurve.length}d | ` +
        `Win: ${(m.winRate * 100).toFixed(0)}% | P&L: ${pnlStr} (${m.totalPnlPercent >= 0 ? '+' : ''}${m.totalPnlPercent.toFixed(1)}%) | ` +
        `Sharpe: ${m.sharpeRatio.toFixed(2)} | DD: ${m.maxDrawdownPercent.toFixed(1)}%`
      );
    } catch (err) {
      console.log(`FAILED: ${err}`);
    }
  }

  // Summary table
  console.log();
  console.log("=".repeat(140));
  console.log("RESULTS COMPARISON: OUT-OF-SAMPLE vs IN-SAMPLE");
  console.log("=".repeat(140));
  console.log(
    "Type".padEnd(5) +
    "Period".padEnd(32) +
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
    const tag = r.type === "out-of-sample" ? "OOS" : " IS";
    const pnlStr = r.pnl >= 0 ? `+$${r.pnl.toFixed(0)}` : `-$${Math.abs(r.pnl).toFixed(0)}`;
    const pctStr = r.pnlPct >= 0 ? `+${r.pnlPct.toFixed(1)}%` : `${r.pnlPct.toFixed(1)}%`;

    console.log(
      tag.padEnd(5) +
      r.label.padEnd(32) +
      `${r.days}`.padEnd(6) +
      `${r.trades}`.padEnd(8) +
      `${(r.winRate * 100).toFixed(0)}%`.padEnd(7) +
      pnlStr.padEnd(13) +
      pctStr.padEnd(9) +
      r.pf.toFixed(2).padEnd(7) +
      r.sharpe.toFixed(2).padEnd(8) +
      `${r.dd.toFixed(1)}%`.padEnd(8) +
      `$${r.avgWin.toFixed(0)}`.padEnd(10) +
      `$${r.avgLoss.toFixed(0)}`.padEnd(10)
    );
  }

  // Verdict
  const oos = results.filter((r) => r.type === "out-of-sample" && !r.label.includes("FULL 4yr"));
  const is = results.filter((r) => r.type === "in-sample");
  const oosProfitable = oos.filter((r) => r.pnl > 0).length;
  const isProfitable = is.filter((r) => r.pnl > 0).length;
  const oosAvgSharpe = oos.reduce((s, r) => s + r.sharpe, 0) / oos.length;
  const isAvgSharpe = is.reduce((s, r) => s + r.sharpe, 0) / is.length;
  const oosAvgReturn = oos.reduce((s, r) => s + r.pnlPct, 0) / oos.length;
  const isAvgReturn = is.reduce((s, r) => s + r.pnlPct, 0) / is.length;

  console.log();
  console.log("=".repeat(70));
  console.log("VERDICT");
  console.log("=".repeat(70));
  console.log(`Out-of-sample (2022-2023):`);
  console.log(`  Profitable periods: ${oosProfitable}/${oos.length}`);
  console.log(`  Avg return: ${oosAvgReturn >= 0 ? '+' : ''}${oosAvgReturn.toFixed(1)}%`);
  console.log(`  Avg Sharpe: ${oosAvgSharpe.toFixed(2)}`);
  console.log();
  console.log(`In-sample (2024-2026):`);
  console.log(`  Profitable periods: ${isProfitable}/${is.length}`);
  console.log(`  Avg return: ${isAvgReturn >= 0 ? '+' : ''}${isAvgReturn.toFixed(1)}%`);
  console.log(`  Avg Sharpe: ${isAvgSharpe.toFixed(2)}`);
  console.log();

  if (oosProfitable >= oos.length / 2 && oosAvgSharpe > 0.5) {
    console.log("PASS: Out-of-sample performance confirms the edge is likely real.");
    console.log("The strategy works across different market regimes (bull, bear, sideways).");
  } else if (oosAvgSharpe > 0) {
    console.log("MIXED: Some out-of-sample edge exists but weaker than in-sample.");
    console.log("The strategy has a small edge but the 2024-2026 results were partially overfitted.");
  } else {
    console.log("FAIL: Out-of-sample performance does not confirm the edge.");
    console.log("The 2024-2026 results were likely overfitted. Do not trade this config live.");
  }

  const full4yr = results.find((r) => r.label.includes("FULL 4yr"));
  if (full4yr) {
    console.log();
    const pnlStr = full4yr.pnl >= 0 ? `+$${full4yr.pnl.toFixed(0)}` : `-$${Math.abs(full4yr.pnl).toFixed(0)}`;
    console.log(
      `Full 4-year result: ${full4yr.trades} trades, ` +
      `${(full4yr.winRate * 100).toFixed(0)}% win, ${pnlStr} (${full4yr.pnlPct >= 0 ? '+' : ''}${full4yr.pnlPct.toFixed(1)}%), ` +
      `Sharpe ${full4yr.sharpe.toFixed(2)}, DD ${full4yr.dd.toFixed(1)}%`
    );
  }
}

main().catch((err) => {
  console.error("Out-of-sample test failed:", err);
  process.exit(1);
});
