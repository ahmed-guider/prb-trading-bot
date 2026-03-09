import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { apiPost } from "../hooks/useApi";
import type { BacktestResult, BacktestTradeResult } from "../types";
import StatsCards from "./StatsCards";
import PriceChart from "./PriceChart";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

interface FormState {
  symbols: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  gapThreshold: number;
  trendEmaFast: number;
  trendEmaSlow: number;
  momentumBodyRatio: number;
  momentumWickMax: number;
  scaleOut1: number;
  scaleOut2: number;
  scaleOut3: number;
  stopLossBuffer: number;
  maxPositions: number;
  riskPerTrade: number;
  dailyLossLimit: number;
  leverageMultiplier: number;
  timeStopHour: number;
}

const defaultForm: FormState = {
  symbols: "AAPL, MSFT, NVDA, TSLA, META, AMZN, GOOG, AMD, NFLX, SPY",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  initialBalance: 100000,
  gapThreshold: 2.0,
  trendEmaFast: 20,
  trendEmaSlow: 50,
  momentumBodyRatio: 0.7,
  momentumWickMax: 0.15,
  scaleOut1: 30,
  scaleOut2: 50,
  scaleOut3: 70,
  stopLossBuffer: 0.002,
  maxPositions: 3,
  riskPerTrade: 0.02,
  dailyLossLimit: 0.05,
  leverageMultiplier: 1,
  timeStopHour: 11,
};

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  } as React.CSSProperties,
  formCard: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    padding: 20,
  } as React.CSSProperties,
  formTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#e1e4e8",
    marginBottom: 16,
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
  } as React.CSSProperties,
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } as React.CSSProperties,
  label: {
    fontSize: 11,
    color: "#8b92a5",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,
  input: {
    background: "#0f1117",
    border: "1px solid #2d3348",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#e1e4e8",
    fontSize: 13,
    outline: "none",
    width: "100%",
  } as React.CSSProperties,
  symbolsInput: {
    background: "#0f1117",
    border: "1px solid #2d3348",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#e1e4e8",
    fontSize: 13,
    outline: "none",
    width: "100%",
    gridColumn: "1 / -1",
  } as React.CSSProperties,
  runBtn: (loading: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 24px",
      background: loading ? "#2d3348" : "#3b82f6",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: loading ? "not-allowed" : "pointer",
      marginTop: 12,
    }) as React.CSSProperties,
  error: {
    background: "#ef444422",
    border: "1px solid #ef4444",
    borderRadius: 8,
    padding: "12px 16px",
    color: "#ef4444",
    fontSize: 13,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#8b92a5",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px solid #2d3348",
    gridColumn: "1 / -1",
  } as React.CSSProperties,
  tradeTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
  } as React.CSSProperties,
  tradeTh: {
    textAlign: "left" as const,
    padding: "8px 10px",
    color: "#8b92a5",
    fontWeight: 500,
    fontSize: 11,
    textTransform: "uppercase" as const,
    borderBottom: "1px solid #2d3348",
  } as React.CSSProperties,
  tradeTd: {
    padding: "8px 10px",
    borderBottom: "1px solid #2d334822",
    color: "#e1e4e8",
  } as React.CSSProperties,
  resultsCard: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    overflow: "hidden",
  } as React.CSSProperties,
  resultsHeader: {
    padding: "14px 18px",
    borderBottom: "1px solid #2d3348",
    fontSize: 14,
    fontWeight: 600,
    color: "#e1e4e8",
  } as React.CSSProperties,
  resultsBody: {
    padding: 16,
  } as React.CSSProperties,
};

function FormField({
  label,
  value,
  onChange,
  type = "number",
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function BacktestPanel() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  function update(key: keyof FormState, val: string) {
    setForm((prev) => ({
      ...prev,
      [key]: key === "symbols" || key === "startDate" || key === "endDate" ? val : Number(val),
    }));
  }

  async function runBacktest() {
    setLoading(true);
    setError(null);
    try {
      const symbols = form.symbols
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (symbols.length === 0) throw new Error("Provide at least one symbol");

      const res = await apiPost<BacktestResult>("/api/backtest", {
        symbols,
        startDate: form.startDate,
        endDate: form.endDate,
        initialBalance: form.initialBalance,
        gapThreshold: form.gapThreshold,
        trendEmaFast: form.trendEmaFast,
        trendEmaSlow: form.trendEmaSlow,
        momentumBodyRatio: form.momentumBodyRatio,
        momentumWickMax: form.momentumWickMax,
        scaleOut1: form.scaleOut1,
        scaleOut2: form.scaleOut2,
        scaleOut3: form.scaleOut3,
        stopLossBuffer: form.stopLossBuffer,
        maxPositions: form.maxPositions,
        riskPerTrade: form.riskPerTrade,
        dailyLossLimit: form.dailyLossLimit,
        leverageMultiplier: form.leverageMultiplier,
        timeStopHour: form.timeStopHour,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const equityData =
    result?.equityCurve.map((p) => ({ date: p.date, value: p.equity })) ?? [];

  const dailyData =
    result?.dailyReturns.map((d) => ({
      date: d.date,
      pnl: d.pnl,
    })) ?? [];

  return (
    <div style={styles.container}>
      {/* Param form */}
      <div style={styles.formCard}>
        <div style={styles.formTitle}>Backtest Configuration</div>
        <div style={styles.grid}>
          <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
            <label style={styles.label}>Symbols (comma separated)</label>
            <input
              style={styles.symbolsInput}
              value={form.symbols}
              onChange={(e) => update("symbols", e.target.value)}
            />
          </div>

          <FormField label="Start Date" value={form.startDate} onChange={(v) => update("startDate", v)} type="date" />
          <FormField label="End Date" value={form.endDate} onChange={(v) => update("endDate", v)} type="date" />
          <FormField label="Initial Balance" value={form.initialBalance} onChange={(v) => update("initialBalance", v)} />

          <div style={styles.sectionTitle}>Screening</div>
          <FormField label="Gap Threshold %" value={form.gapThreshold} onChange={(v) => update("gapThreshold", v)} step="0.1" />
          <FormField label="Trend EMA Fast" value={form.trendEmaFast} onChange={(v) => update("trendEmaFast", v)} />
          <FormField label="Trend EMA Slow" value={form.trendEmaSlow} onChange={(v) => update("trendEmaSlow", v)} />

          <div style={styles.sectionTitle}>Entry</div>
          <FormField label="Momentum Body Ratio" value={form.momentumBodyRatio} onChange={(v) => update("momentumBodyRatio", v)} step="0.05" />
          <FormField label="Momentum Wick Max" value={form.momentumWickMax} onChange={(v) => update("momentumWickMax", v)} step="0.05" />

          <div style={styles.sectionTitle}>Exit / Scale-Outs</div>
          <FormField label="Scale Out 1 %" value={form.scaleOut1} onChange={(v) => update("scaleOut1", v)} />
          <FormField label="Scale Out 2 %" value={form.scaleOut2} onChange={(v) => update("scaleOut2", v)} />
          <FormField label="Scale Out 3 %" value={form.scaleOut3} onChange={(v) => update("scaleOut3", v)} />
          <FormField label="Time Stop Hour" value={form.timeStopHour} onChange={(v) => update("timeStopHour", v)} />

          <div style={styles.sectionTitle}>Risk</div>
          <FormField label="Stop Loss Buffer" value={form.stopLossBuffer} onChange={(v) => update("stopLossBuffer", v)} step="0.001" />
          <FormField label="Max Positions" value={form.maxPositions} onChange={(v) => update("maxPositions", v)} />
          <FormField label="Risk Per Trade" value={form.riskPerTrade} onChange={(v) => update("riskPerTrade", v)} step="0.01" />
          <FormField label="Daily Loss Limit" value={form.dailyLossLimit} onChange={(v) => update("dailyLossLimit", v)} step="0.01" />
          <FormField label="Leverage Multiplier" value={form.leverageMultiplier} onChange={(v) => update("leverageMultiplier", v)} step="0.5" />
        </div>

        <button
          style={styles.runBtn(loading)}
          disabled={loading}
          onClick={runBacktest}
        >
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={16} />}
          {loading ? "Running Backtest..." : "Run Backtest"}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Results */}
      {result && (
        <>
          <StatsCards
            totalPnl={result.metrics.totalPnl}
            winRate={result.metrics.winRate}
            totalTrades={result.metrics.totalTrades}
            profitFactor={result.metrics.profitFactor}
            maxDrawdownPercent={result.metrics.maxDrawdownPercent}
            sharpeRatio={result.metrics.sharpeRatio}
          />

          <PriceChart
            data={equityData}
            title="Equity Curve"
            color={result.metrics.totalPnl >= 0 ? "green" : "red"}
          />

          {/* Daily Returns Bar Chart */}
          <div style={styles.resultsCard}>
            <div style={styles.resultsHeader}>Daily Returns</div>
            <div style={{ ...styles.resultsBody, height: 280 }}>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d334844" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#8b92a5", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#2d3348" }}
                    />
                    <YAxis
                      tick={{ fill: "#8b92a5", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "#2d3348" }}
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1a1d27",
                        border: "1px solid #2d3348",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "#e1e4e8",
                      }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]}
                      labelStyle={{ color: "#8b92a5" }}
                    />
                    <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                      {dailyData.map((d, i) => (
                        <Cell key={i} fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", color: "#8b92a5", paddingTop: 80 }}>
                  No daily return data
                </div>
              )}
            </div>
          </div>

          {/* Trades table */}
          <div style={styles.resultsCard}>
            <div style={styles.resultsHeader}>
              Backtest Trades ({result.trades.length})
            </div>
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={styles.tradeTable}>
                <thead>
                  <tr>
                    <th style={styles.tradeTh}>Date</th>
                    <th style={styles.tradeTh}>Symbol</th>
                    <th style={styles.tradeTh}>Entry</th>
                    <th style={styles.tradeTh}>Exit</th>
                    <th style={styles.tradeTh}>P&L</th>
                    <th style={styles.tradeTh}>P&L %</th>
                    <th style={styles.tradeTh}>Reason</th>
                    <th style={styles.tradeTh}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t: BacktestTradeResult, i: number) => {
                    const color = t.pnl > 0 ? "#22c55e" : t.pnl < 0 ? "#ef4444" : "#8b92a5";
                    return (
                      <tr key={i}>
                        <td style={styles.tradeTd}>{t.date}</td>
                        <td style={{ ...styles.tradeTd, fontWeight: 600 }}>{t.symbol}</td>
                        <td style={styles.tradeTd}>${t.entryPrice.toFixed(2)}</td>
                        <td style={styles.tradeTd}>${t.exitPrice.toFixed(2)}</td>
                        <td style={{ ...styles.tradeTd, color, fontWeight: 600 }}>
                          {t.pnl >= 0 ? "+$" : "-$"}{Math.abs(t.pnl).toFixed(2)}
                        </td>
                        <td style={{ ...styles.tradeTd, color }}>
                          {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                        </td>
                        <td style={styles.tradeTd}>{t.exitReason}</td>
                        <td style={styles.tradeTd}>{t.holdingMinutes}m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Spinner animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
