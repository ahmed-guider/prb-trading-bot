import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getLatestBar } from "../data/market-data.js";
import type { Candidate } from "../data/storage.js";
import { isBreakoutCandle } from "../indicators/candle-patterns.js";

const log = createLogger("entry-signals");

/** Price targets: 1%, 2%, 3% stock moves for the three scale-out levels */
const PRICE_TARGET_1_PCT = 1;
const PRICE_TARGET_2_PCT = 2;
const PRICE_TARGET_3_PCT = 3;

export interface EntrySignal {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  resistanceLevel: number;
  gapPercent: number;
  confidence: number;
}

/**
 * Check a single candidate for a breakout entry signal at market open (9:30 AM ET).
 *
 * Fetches the latest 5-min candle and evaluates whether it is a breakout candle
 * that closes above the candidate's resistance level.
 */
export async function checkForEntry(candidate: Candidate): Promise<EntrySignal | null> {
  try {
    const latestCandle = await getLatestBar(candidate.symbol);

    // Check if this is a breakout candle above resistance
    const isBreakout = isBreakoutCandle(
      latestCandle,
      candidate.resistance_level,
      config.strategy.momentumBodyRatio,
      config.strategy.momentumWickMax,
    );

    if (!isBreakout) {
      log.debug(`${candidate.symbol}: no breakout candle detected`);
      return null;
    }

    const entryPrice = latestCandle.close;

    // Stop loss = candle low minus a buffer
    const stopLoss = latestCandle.low - config.strategy.stopLossBuffer * entryPrice;

    // Price targets: simple percentage stock moves
    const target1 = entryPrice * (1 + PRICE_TARGET_1_PCT / 100);
    const target2 = entryPrice * (1 + PRICE_TARGET_2_PCT / 100);
    const target3 = entryPrice * (1 + PRICE_TARGET_3_PCT / 100);

    // Confidence score based on gap size, trend, and resistance touches
    const confidence = calculateConfidence(candidate);

    const signal: EntrySignal = {
      symbol: candidate.symbol,
      entryPrice,
      stopLoss,
      target1,
      target2,
      target3,
      resistanceLevel: candidate.resistance_level,
      gapPercent: candidate.gap_percent,
      confidence,
    };

    log.info(
      `Entry signal: ${candidate.symbol} @ ${entryPrice.toFixed(2)} | ` +
      `SL=${stopLoss.toFixed(2)} T1=${target1.toFixed(2)} T2=${target2.toFixed(2)} T3=${target3.toFixed(2)} | ` +
      `confidence=${confidence.toFixed(2)}`,
    );

    return signal;
  } catch (err) {
    log.warn(`${candidate.symbol}: error checking entry`, err);
    return null;
  }
}

/**
 * Scan all candidates and return valid entry signals.
 */
export async function scanForEntries(candidates: Candidate[]): Promise<EntrySignal[]> {
  if (candidates.length === 0) {
    log.info("No candidates to scan for entries");
    return [];
  }

  log.info(`Checking ${candidates.length} candidates for entry signals`);

  const signals: EntrySignal[] = [];

  const results = await Promise.allSettled(
    candidates.map((c) => checkForEntry(c)),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      signals.push(result.value);
    }
  }

  log.info(`Entry scan complete: ${signals.length} signals found`);

  return signals;
}

/**
 * Calculate a confidence score (0-1) based on:
 * - Gap size (larger gap = higher confidence, up to a point)
 * - How far above the gap threshold the stock is
 */
function calculateConfidence(candidate: Candidate): number {
  // Gap component: scale from threshold to 2x threshold → 0.0 to 0.5
  const gapThreshold = config.strategy.gapThreshold;
  const gapScore = Math.min(
    0.5,
    ((candidate.gap_percent - gapThreshold) / gapThreshold) * 0.5,
  );

  // Resistance break component: if price is above resistance → 0.3
  const resistanceScore = candidate.premarket_high > candidate.resistance_level ? 0.3 : 0.1;

  // Relative strength component: SPY flat/down while stock gaps up → 0.2
  const rsScore = candidate.spy_change < 0.5 ? 0.2 : 0.1;

  return Math.min(1.0, Math.max(0, gapScore + resistanceScore + rsScore));
}
