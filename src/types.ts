export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ResistanceLevel {
  price: number;
  touches: number;
  lastTouch: number;
  strength: number;
}

export interface GapAnalysis {
  gapPercent: number;
  gapDollar: number;
}

export interface TrendAnalysis {
  uptrend: boolean;
  emaFast: number;
  emaSlow: number;
  slope: number;
}

export interface CandleMetrics {
  bodyPercent: number;
  upperWickPercent: number;
  lowerWickPercent: number;
  isBullish: boolean;
  range: number;
}
