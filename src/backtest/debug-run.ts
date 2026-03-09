/**
 * Debug backtest — logs why stocks are being filtered out at each stage.
 */

import "dotenv/config";
import { getHistoricalBars } from "../data/market-data.js";
import { isUptrend } from "../indicators/trend.js";
import { calculateGap, hasRelativeStrength } from "../indicators/gap.js";
import { findResistanceLevels } from "../indicators/resistance.js";
import { isBreakoutCandle, isMomentumCandle, getCandleMetrics } from "../indicators/candle-patterns.js";
import type { Candle } from "../types.js";

const SYMBOLS = ["AAPL", "NVDA", "TSLA", "META", "PLTR"];
const START = "2025-11-01";
const END = "2025-12-31";

async function main() {
  // Load SPY daily data for gap comparison
  const spyDaily = await getHistoricalBars("SPY", "1Day", "2025-08-01", END);

  for (const symbol of SYMBOLS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ANALYZING: ${symbol}`);
    console.log("=".repeat(60));

    const dailyCandles = await getHistoricalBars(symbol, "1Day", "2025-07-01", END);
    const fiveMinCandles = await getHistoricalBars(symbol, "5Min", START, END);

    console.log(`  Daily candles: ${dailyCandles.length}`);
    console.log(`  5-min candles: ${fiveMinCandles.length}`);

    // Check avg volume
    const last20 = dailyCandles.slice(-20);
    const avgVol = last20.reduce((s, c) => s + c.volume, 0) / last20.length;
    console.log(`  Avg volume (20d): ${(avgVol / 1e6).toFixed(1)}M ${avgVol > 10e6 ? '✅' : '❌'}`);

    // Check uptrend
    const trend = isUptrend(dailyCandles, 20, 50);
    console.log(`  Uptrend: ${trend.uptrend ? '✅' : '❌'} (EMA20=${trend.emaFast.toFixed(2)}, EMA50=${trend.emaSlow.toFixed(2)}, slope=${trend.slope.toFixed(4)})`);

    // Get trading days and check gaps
    const tradingDays = dailyCandles
      .filter(c => {
        const d = new Date(c.timestamp).toISOString().slice(0, 10);
        return d >= START && d <= END;
      });

    let gapCount = 0;
    let bigGapDays: string[] = [];

    for (let i = 1; i < tradingDays.length; i++) {
      const prevClose = tradingDays[i - 1].close;
      const todayOpen = tradingDays[i].open;
      const gapPct = ((todayOpen - prevClose) / prevClose) * 100;

      if (gapPct >= 1.0) {
        gapCount++;
        const dateStr = new Date(tradingDays[i].timestamp).toISOString().slice(0, 10);

        // Find SPY gap for same day
        const spyDay = spyDaily.find(c =>
          new Date(c.timestamp).toISOString().slice(0, 10) === dateStr
        );
        const spyPrevIdx = spyDaily.findIndex(c =>
          new Date(c.timestamp).toISOString().slice(0, 10) === dateStr
        ) - 1;
        const spyGap = spyPrevIdx >= 0 && spyDay
          ? ((spyDay.open - spyDaily[spyPrevIdx].close) / spyDaily[spyPrevIdx].close) * 100
          : 0;

        const relStr = hasRelativeStrength(gapPct, spyGap);

        if (gapPct >= 2.0) {
          bigGapDays.push(dateStr);
          console.log(`  Gap ${dateStr}: +${gapPct.toFixed(1)}% (SPY: ${spyGap >= 0 ? '+' : ''}${spyGap.toFixed(1)}%) RelStr: ${relStr ? '✅' : '❌'}`);

          // Check first 5-min candle
          const dayStart = new Date(`${dateStr}T14:30:00Z`).getTime();
          const dayEnd = new Date(`${dateStr}T14:35:00Z`).getTime();
          const firstCandle = fiveMinCandles.find(c => c.timestamp >= dayStart && c.timestamp <= dayEnd);

          if (firstCandle) {
            const metrics = getCandleMetrics(firstCandle);
            const momentum = isMomentumCandle(firstCandle, 0.7, 0.15);
            console.log(`    First 5m candle: O=${firstCandle.open.toFixed(2)} H=${firstCandle.high.toFixed(2)} L=${firstCandle.low.toFixed(2)} C=${firstCandle.close.toFixed(2)}`);
            console.log(`    Body: ${(metrics.bodyPercent*100).toFixed(0)}% UWick: ${(metrics.upperWickPercent*100).toFixed(0)}% Bullish: ${metrics.isBullish} Momentum: ${momentum ? '✅' : '❌'}`);

            // Check with relaxed params
            const relaxedMom = isMomentumCandle(firstCandle, 0.5, 0.3);
            console.log(`    Relaxed momentum (50%/30%): ${relaxedMom ? '✅' : '❌'}`);
          } else {
            console.log(`    No 5-min candle found at market open`);
          }
        }
      }
    }

    console.log(`  Total gap-up days (>1%): ${gapCount}`);
    console.log(`  Big gap-up days (>2%): ${bigGapDays.length}`);
  }
}

main().catch(console.error);
