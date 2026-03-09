/**
 * Backtest runner — run from CLI with: npm run backtest
 *
 * Runs the PRB strategy against historical data and prints results.
 */

import { runBacktest, type BacktestParams } from "./engine.js";
import { getSP500Symbols } from "../data/market-data.js";

// Use a subset of high-volume, well-known stocks for the initial test
const TEST_SYMBOLS = [
  "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META", "TSLA",
  "JPM", "V", "MA", "HD", "COST", "AVGO", "LLY", "NFLX",
  "AMD", "CRM", "UBER", "PLTR", "NOW",
];

const params: BacktestParams = {
  symbols: TEST_SYMBOLS,
  startDate: "2025-09-01",
  endDate: "2026-02-28",
  initialBalance: 100_000,
  gapThreshold: 1.5,
  trendEmaFast: 20,
  trendEmaSlow: 50,
  momentumBodyRatio: 0.5,
  momentumWickMax: 0.3,
  scaleOut1: 1,    // 1% stock price move (≈ 30% options gain with ~10x leverage)
  scaleOut2: 2,    // 2% stock price move
  scaleOut3: 3,    // 3% stock price move
  stopLossBuffer: 0.002,
  maxPositions: 3,
  riskPerTrade: 0.02,
  dailyLossLimit: 0.05,
  leverageMultiplier: 10,
  timeStopHour: 11,
};

async function main() {
  console.log("=".repeat(70));
  console.log("PRB STRATEGY BACKTEST");
  console.log("=".repeat(70));
  console.log(`Symbols: ${params.symbols.length}`);
  console.log(`Period: ${params.startDate} to ${params.endDate}`);
  console.log(`Initial Balance: $${params.initialBalance.toLocaleString()}`);
  console.log(`Gap Threshold: ${params.gapThreshold}%`);
  console.log(`Scale-out targets: ${params.scaleOut1}% / ${params.scaleOut2}% / ${params.scaleOut3}%`);
  console.log(`Time Stop: ${params.timeStopHour}:00 AM ET`);
  console.log("=".repeat(70));
  console.log();

  const startTime = Date.now();
  const result = await runBacktest(params);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log();
  console.log("=".repeat(70));
  console.log("RESULTS");
  console.log("=".repeat(70));

  const m = result.metrics;
  console.log(`Total Trades:       ${m.totalTrades}`);
  console.log(`Winning Trades:     ${m.winningTrades}`);
  console.log(`Losing Trades:      ${m.losingTrades}`);
  console.log(`Win Rate:           ${(m.winRate * 100).toFixed(1)}%`);
  console.log(`Avg Win:            $${m.avgWin.toFixed(2)}`);
  console.log(`Avg Loss:           $${m.avgLoss.toFixed(2)}`);
  console.log(`Profit Factor:      ${m.profitFactor.toFixed(2)}`);
  console.log(`Total P&L:          $${m.totalPnl.toFixed(2)}`);
  console.log(`Total P&L %:        ${m.totalPnlPercent.toFixed(2)}%`);
  console.log(`Max Drawdown:       ${m.maxDrawdownPercent.toFixed(2)}%`);
  console.log(`Sharpe Ratio:       ${m.sharpeRatio.toFixed(2)}`);
  console.log(`Sortino Ratio:      ${m.sortinoRatio.toFixed(2)}`);
  console.log(`Best Trade:         $${m.bestTrade.toFixed(2)}`);
  console.log(`Worst Trade:        $${m.worstTrade.toFixed(2)}`);
  console.log(`Max Consec. Wins:   ${m.maxConsecutiveWins}`);
  console.log(`Max Consec. Losses: ${m.maxConsecutiveLosses}`);
  console.log(`Avg Holding (min):  ${m.avgHoldingMinutes.toFixed(0)}`);
  console.log(`Avg Trades/Day:     ${m.avgTradesPerDay.toFixed(2)}`);
  console.log();

  // Print individual trades
  if (result.trades.length > 0) {
    console.log("-".repeat(70));
    console.log("TRADE LOG");
    console.log("-".repeat(70));
    console.log(
      "Date".padEnd(12) +
      "Symbol".padEnd(8) +
      "Entry".padEnd(10) +
      "Exit".padEnd(10) +
      "P&L".padEnd(12) +
      "P&L%".padEnd(8) +
      "Reason".padEnd(12) +
      "Hold(min)"
    );
    console.log("-".repeat(70));

    for (const t of result.trades) {
      const pnlStr = t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`;
      const pctStr = t.pnlPercent >= 0 ? `+${t.pnlPercent.toFixed(1)}%` : `${t.pnlPercent.toFixed(1)}%`;
      console.log(
        t.date.padEnd(12) +
        t.symbol.padEnd(8) +
        `$${t.entryPrice.toFixed(2)}`.padEnd(10) +
        `$${t.exitPrice.toFixed(2)}`.padEnd(10) +
        pnlStr.padEnd(12) +
        pctStr.padEnd(8) +
        t.exitReason.padEnd(12) +
        t.holdingMinutes.toFixed(0)
      );
    }
  }

  console.log();
  console.log(`Backtest completed in ${elapsed}s`);

  // Final equity
  const finalEquity = result.equityCurve[result.equityCurve.length - 1]?.equity ?? params.initialBalance;
  console.log(`Final equity: $${finalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
