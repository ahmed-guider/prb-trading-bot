import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  alpaca: z.object({
    apiKey: z.string().min(1, "ALPACA_API_KEY is required"),
    apiSecret: z.string().min(1, "ALPACA_API_SECRET is required"),
    paper: z.boolean().default(true),
  }),
  polygonApiKey: z.string().optional(),
  strategy: z.object({
    gapThreshold: z.number().positive().default(2.0),
    trendEmaFast: z.number().int().positive().default(20),
    trendEmaSlow: z.number().int().positive().default(50),
    momentumBodyRatio: z.number().min(0).max(1).default(0.7),
    momentumWickMax: z.number().min(0).max(1).default(0.15),
    scaleOut1: z.number().min(0).max(100).default(30),
    scaleOut2: z.number().min(0).max(100).default(50),
    scaleOut3: z.number().min(0).max(100).default(70),
    stopLossBuffer: z.number().positive().default(0.002),
    maxPositions: z.number().int().positive().default(3),
    riskPerTrade: z.number().positive().max(1).default(0.02),
    dailyLossLimit: z.number().positive().max(1).default(0.05),
    timeStopHour: z.number().int().min(0).max(23).default(11),
  }),
  server: z.object({
    port: z.number().int().positive().default(3001),
  }),
});

export type Config = z.infer<typeof envSchema>;

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function loadConfig(): Config {
  const env = process.env;

  const raw = {
    alpaca: {
      apiKey: env.ALPACA_API_KEY ?? "",
      apiSecret: env.ALPACA_API_SECRET ?? "",
      paper: parseBool(env.ALPACA_PAPER, true),
    },
    polygonApiKey: env.POLYGON_API_KEY || undefined,
    strategy: {
      gapThreshold: parseNumber(env.GAP_THRESHOLD, 2.0),
      trendEmaFast: parseNumber(env.TREND_EMA_FAST, 20),
      trendEmaSlow: parseNumber(env.TREND_EMA_SLOW, 50),
      momentumBodyRatio: parseNumber(env.MOMENTUM_BODY_RATIO, 0.7),
      momentumWickMax: parseNumber(env.MOMENTUM_WICK_MAX, 0.15),
      scaleOut1: parseNumber(env.SCALE_OUT_1, 30),
      scaleOut2: parseNumber(env.SCALE_OUT_2, 50),
      scaleOut3: parseNumber(env.SCALE_OUT_3, 70),
      stopLossBuffer: parseNumber(env.STOP_LOSS_BUFFER, 0.002),
      maxPositions: parseNumber(env.MAX_POSITIONS, 3),
      riskPerTrade: parseNumber(env.RISK_PER_TRADE, 0.02),
      dailyLossLimit: parseNumber(env.DAILY_LOSS_LIMIT, 0.05),
      timeStopHour: parseNumber(env.TIME_STOP_HOUR, 11),
    },
    server: {
      port: parseNumber(env.PORT, 3001),
    },
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}

export const config: Config = loadConfig();
