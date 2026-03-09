import { useState, useEffect } from "react";
import { Save, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useApi, apiPut } from "../hooks/useApi";
import type { Config } from "../types";

type StrategyConfig = Config["strategy"];

interface FieldDef {
  key: keyof StrategyConfig;
  label: string;
  step?: string;
  min?: number;
  max?: number;
  description?: string;
}

const fieldGroups: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Screening",
    fields: [
      { key: "gapThreshold", label: "Gap Threshold %", step: "0.1", min: 0, description: "Minimum gap up percentage to qualify" },
      { key: "trendEmaFast", label: "Trend EMA Fast", min: 1, description: "Fast EMA period for uptrend filter" },
      { key: "trendEmaSlow", label: "Trend EMA Slow", min: 1, description: "Slow EMA period for uptrend filter" },
    ],
  },
  {
    title: "Entry",
    fields: [
      { key: "momentumBodyRatio", label: "Momentum Body Ratio", step: "0.05", min: 0, max: 1, description: "Min body-to-range ratio for breakout candle" },
      { key: "momentumWickMax", label: "Momentum Wick Max", step: "0.05", min: 0, max: 1, description: "Max upper wick ratio for breakout candle" },
    ],
  },
  {
    title: "Exit / Scale-Outs",
    fields: [
      { key: "scaleOut1", label: "Scale Out 1 %", min: 0, max: 100, description: "% of position to sell at target 1" },
      { key: "scaleOut2", label: "Scale Out 2 %", min: 0, max: 100, description: "% of remaining at target 2" },
      { key: "scaleOut3", label: "Scale Out 3 %", min: 0, max: 100, description: "% of remaining at target 3" },
      { key: "timeStopHour", label: "Time Stop Hour (ET)", min: 0, max: 23, description: "Hour to force-close positions" },
    ],
  },
  {
    title: "Risk Management",
    fields: [
      { key: "stopLossBuffer", label: "Stop Loss Buffer", step: "0.001", min: 0, description: "Buffer below support for stop placement" },
      { key: "maxPositions", label: "Max Positions", min: 1, description: "Maximum concurrent open positions" },
      { key: "riskPerTrade", label: "Risk Per Trade", step: "0.01", min: 0, max: 1, description: "Fraction of account risked per trade" },
      { key: "dailyLossLimit", label: "Daily Loss Limit", step: "0.01", min: 0, max: 1, description: "Max daily loss as fraction of account" },
    ],
  },
];

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
    maxWidth: 800,
  } as React.CSSProperties,
  group: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    overflow: "hidden",
  } as React.CSSProperties,
  groupTitle: {
    padding: "14px 18px",
    borderBottom: "1px solid #2d3348",
    fontSize: 14,
    fontWeight: 600,
    color: "#e1e4e8",
  } as React.CSSProperties,
  fields: {
    padding: 16,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 16,
  } as React.CSSProperties,
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } as React.CSSProperties,
  label: {
    fontSize: 12,
    color: "#e1e4e8",
    fontWeight: 500,
  } as React.CSSProperties,
  desc: {
    fontSize: 11,
    color: "#8b92a5",
    marginBottom: 2,
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
  saveBtn: (loading: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 24px",
      background: loading ? "#2d3348" : "#22c55e",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: loading ? "not-allowed" : "pointer",
      alignSelf: "flex-start",
    }) as React.CSSProperties,
  toast: (type: "success" | "error") =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 16px",
      borderRadius: 8,
      fontSize: 13,
      background: type === "success" ? "#22c55e22" : "#ef444422",
      border: `1px solid ${type === "success" ? "#22c55e" : "#ef4444"}`,
      color: type === "success" ? "#22c55e" : "#ef4444",
    }) as React.CSSProperties,
};

export default function SettingsPanel() {
  const { data: configData, loading: configLoading, refresh } = useApi<Config>("/api/config");
  const [form, setForm] = useState<StrategyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (configData?.strategy) {
      setForm({ ...configData.strategy });
    }
  }, [configData]);

  function updateField(key: keyof StrategyConfig, val: string) {
    setForm((prev) => (prev ? { ...prev, [key]: Number(val) } : null));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setToast(null);
    try {
      await apiPut<Config>("/api/config", form);
      setToast({ type: "success", msg: "Settings saved successfully" });
      refresh();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  if (configLoading || !form) {
    return (
      <div style={{ textAlign: "center", color: "#8b92a5", padding: 40 }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {fieldGroups.map((group) => (
        <div key={group.title} style={styles.group}>
          <div style={styles.groupTitle}>{group.title}</div>
          <div style={styles.fields}>
            {group.fields.map((f) => (
              <div key={f.key} style={styles.field}>
                <label style={styles.label}>{f.label}</label>
                {f.description && <div style={styles.desc}>{f.description}</div>}
                <input
                  style={styles.input}
                  type="number"
                  step={f.step ?? "1"}
                  min={f.min}
                  max={f.max}
                  value={form[f.key]}
                  onChange={(e) => updateField(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        style={styles.saveBtn(saving)}
        disabled={saving}
        onClick={save}
      >
        {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {toast && (
        <div style={styles.toast(toast.type)}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
