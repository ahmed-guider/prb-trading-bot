import { createLogger } from "../logger.js";
import { runBacktest, type BacktestParams } from "./engine.js";
import type { BacktestMetrics } from "./metrics.js";

const log = createLogger("backtest-sweep");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SweepConfig {
  baseParams: BacktestParams;
  sweepParams: {
    [key: string]: number[]; // param name → values to test
  };
}

export interface SweepResult {
  params: Record<string, number>;
  metrics: BacktestMetrics;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate all combinations of sweep parameter values.
 * E.g., { a: [1,2], b: [10,20] } → [{ a:1, b:10 }, { a:1, b:20 }, { a:2, b:10 }, { a:2, b:20 }]
 */
function generateCombinations(
  sweepParams: Record<string, number[]>,
): Record<string, number>[] {
  const keys = Object.keys(sweepParams);
  if (keys.length === 0) return [{}];

  const combos: Record<string, number>[] = [];

  function recurse(index: number, current: Record<string, number>): void {
    if (index === keys.length) {
      combos.push({ ...current });
      return;
    }

    const key = keys[index];
    const values = sweepParams[key];

    for (const value of values) {
      current[key] = value;
      recurse(index + 1, current);
    }
  }

  recurse(0, {});
  return combos;
}

/**
 * Apply a set of override parameters onto a base BacktestParams object.
 */
function applyOverrides(
  base: BacktestParams,
  overrides: Record<string, number>,
): BacktestParams {
  const params = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (key in params) {
      (params as any)[key] = value;
    } else {
      log.warn(`Unknown sweep parameter: ${key}`);
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Main sweep runner
// ---------------------------------------------------------------------------

/**
 * Run a parameter sweep: test all combinations of the provided sweep
 * parameters against the base backtest configuration.
 *
 * Results are returned sorted by Sharpe ratio descending.
 */
export async function runSweep(config: SweepConfig): Promise<SweepResult[]> {
  const combinations = generateCombinations(config.sweepParams);
  const totalCombos = combinations.length;

  log.info(`Starting parameter sweep: ${totalCombos} combinations to test`);

  const results: SweepResult[] = [];

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];
    const params = applyOverrides(config.baseParams, combo);

    log.info(
      `Sweep ${i + 1} of ${totalCombos}: ${JSON.stringify(combo)}`,
    );

    try {
      const backtestResult = await runBacktest(params);

      results.push({
        params: combo,
        metrics: backtestResult.metrics,
      });

      log.info(
        `Sweep ${i + 1}/${totalCombos} complete: ` +
        `Sharpe=${backtestResult.metrics.sharpeRatio.toFixed(2)} ` +
        `WinRate=${(backtestResult.metrics.winRate * 100).toFixed(1)}% ` +
        `PnL=$${backtestResult.metrics.totalPnl.toFixed(2)}`,
      );
    } catch (err) {
      log.warn(`Sweep ${i + 1}/${totalCombos} failed for params ${JSON.stringify(combo)}`, err);
    }
  }

  // Sort by Sharpe ratio descending
  results.sort((a, b) => b.metrics.sharpeRatio - a.metrics.sharpeRatio);

  log.info(`Sweep complete: ${results.length}/${totalCombos} successful runs`);

  if (results.length > 0) {
    const best = results[0];
    log.info(
      `Best result: Sharpe=${best.metrics.sharpeRatio.toFixed(2)} ` +
      `WinRate=${(best.metrics.winRate * 100).toFixed(1)}% ` +
      `PnL=$${best.metrics.totalPnl.toFixed(2)} ` +
      `Params=${JSON.stringify(best.params)}`,
    );
  }

  return results;
}
