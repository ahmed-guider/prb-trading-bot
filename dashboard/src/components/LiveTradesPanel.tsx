import { CircleDot } from "lucide-react";
import { useApi } from "../hooks/useApi";
import type { Position } from "../types";

interface PositionsResponse {
  count: number;
  balance: number;
  positions: Position[];
}

const styles = {
  container: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 20,
  } as React.CSSProperties,
  header: {
    padding: "14px 18px",
    borderBottom: "1px solid #2d3348",
    fontSize: 14,
    fontWeight: 600,
    color: "#e1e4e8",
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 12,
    padding: 14,
  } as React.CSSProperties,
  card: {
    background: "#0f1117",
    border: "1px solid #2d3348",
    borderRadius: 8,
    padding: 16,
  } as React.CSSProperties,
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } as React.CSSProperties,
  symbol: {
    fontSize: 16,
    fontWeight: 700,
    color: "#e1e4e8",
  } as React.CSSProperties,
  label: {
    fontSize: 11,
    color: "#8b92a5",
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
  } as React.CSSProperties,
  val: {
    fontSize: 13,
    color: "#e1e4e8",
    fontWeight: 500,
  } as React.CSSProperties,
  targetsRow: {
    display: "flex",
    gap: 8,
    marginTop: 10,
  } as React.CSSProperties,
  targetBar: (hit: boolean) =>
    ({
      flex: 1,
      height: 6,
      borderRadius: 3,
      background: hit ? "#22c55e" : "#2d3348",
      transition: "background 0.3s",
    }) as React.CSSProperties,
  targetLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#8b92a5",
    marginTop: 4,
  } as React.CSSProperties,
  empty: {
    padding: 30,
    textAlign: "center" as const,
    color: "#8b92a5",
    fontSize: 13,
  } as React.CSSProperties,
};

function PositionCard({ pos }: { pos: Position }) {
  const unrealizedPnlPct =
    pos.entryPrice > 0
      ? (((pos.targets[0] ?? pos.entryPrice) - pos.entryPrice) / pos.entryPrice) * 100
      : 0;

  const scaleHits = [
    pos.scaledOutLevels.length >= 1,
    pos.scaledOutLevels.length >= 2,
    pos.scaledOutLevels.length >= 3,
  ];

  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <span style={styles.symbol}>{pos.symbol}</span>
        <span
          style={{
            ...styles.val,
            color: unrealizedPnlPct >= 0 ? "#22c55e" : "#ef4444",
            fontWeight: 700,
          }}
        >
          {unrealizedPnlPct >= 0 ? "+" : ""}
          {unrealizedPnlPct.toFixed(2)}%
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
        <div>
          <div style={styles.label}>Entry Price</div>
          <div style={styles.val}>${pos.entryPrice.toFixed(2)}</div>
        </div>
        <div>
          <div style={styles.label}>Size</div>
          <div style={styles.val}>
            {pos.currentSize} / {pos.originalSize}
          </div>
        </div>
        <div>
          <div style={styles.label}>Stop Loss</div>
          <div style={{ ...styles.val, color: "#ef4444" }}>
            ${pos.stopLoss.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={styles.label}>Targets</div>
          <div style={styles.val}>
            {pos.targets.map((t) => `$${t.toFixed(2)}`).join(" / ")}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={styles.label}>Scale-Out Progress</div>
        <div style={styles.targetsRow}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={styles.targetBar(scaleHits[i])} />
          ))}
        </div>
        <div style={styles.targetLabel}>
          <span>T1</span>
          <span>T2</span>
          <span>T3</span>
        </div>
      </div>
    </div>
  );
}

export default function LiveTradesPanel() {
  const { data, loading } = useApi<PositionsResponse>("/api/positions", 3000);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <CircleDot size={16} color="#22c55e" />
        Active Positions
      </div>
      {loading ? (
        <div style={styles.empty}>Loading positions...</div>
      ) : !data?.positions.length ? (
        <div style={styles.empty}>No open positions</div>
      ) : (
        <div style={styles.grid}>
          {data.positions.map((pos) => (
            <PositionCard key={pos.tradeId} pos={pos} />
          ))}
        </div>
      )}
    </div>
  );
}
