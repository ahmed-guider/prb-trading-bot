import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Trade } from "../types";

interface TradeTableProps {
  trades: Trade[];
  pageSize?: number;
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
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  } as React.CSSProperties,
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    color: "#8b92a5",
    fontWeight: 500,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    borderBottom: "1px solid #2d3348",
  } as React.CSSProperties,
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #2d334822",
    color: "#e1e4e8",
  } as React.CSSProperties,
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 18px",
    borderTop: "1px solid #2d3348",
    fontSize: 12,
    color: "#8b92a5",
  } as React.CSSProperties,
  pageBtn: (disabled: boolean) =>
    ({
      background: "none",
      border: "1px solid #2d3348",
      color: disabled ? "#2d3348" : "#e1e4e8",
      borderRadius: 6,
      padding: "4px 8px",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex",
      alignItems: "center",
      gap: 4,
    }) as React.CSSProperties,
  empty: {
    padding: 30,
    textAlign: "center" as const,
    color: "#8b92a5",
    fontSize: 13,
  } as React.CSSProperties,
};

function formatDuration(entryTime: string, exitTime: string | null | undefined): string {
  if (!exitTime) return "--";
  const ms = new Date(exitTime).getTime() - new Date(entryTime).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatReason(reason: string | null | undefined): string {
  if (!reason) return "--";
  return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TradeTable({ trades, pageSize = 15 }: TradeTableProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(trades.length / pageSize));
  const slice = trades.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div style={styles.container}>
      <div style={styles.header}>Trade History</div>
      {trades.length === 0 ? (
        <div style={styles.empty}>No trades yet</div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Symbol</th>
                  <th style={styles.th}>Entry</th>
                  <th style={styles.th}>Exit</th>
                  <th style={styles.th}>P&L</th>
                  <th style={styles.th}>P&L %</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((t, i) => {
                  const pnl = t.pnl ?? 0;
                  const pnlPct = t.pnl_percent ?? 0;
                  const isWin = pnl > 0;
                  const color = pnl === 0 ? "#8b92a5" : isWin ? "#22c55e" : "#ef4444";
                  return (
                    <tr key={t.id ?? `${t.symbol}-${i}`}>
                      <td style={styles.td}>{t.date}</td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{t.symbol}</td>
                      <td style={styles.td}>${t.entry_price.toFixed(2)}</td>
                      <td style={styles.td}>
                        {t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : "--"}
                      </td>
                      <td style={{ ...styles.td, color, fontWeight: 600 }}>
                        {pnl >= 0 ? "+$" : "-$"}
                        {Math.abs(pnl).toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, color }}>
                        {pnlPct >= 0 ? "+" : ""}
                        {pnlPct.toFixed(2)}%
                      </td>
                      <td style={styles.td}>{formatReason(t.exit_reason)}</td>
                      <td style={styles.td}>
                        {formatDuration(t.entry_time, t.exit_time)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={styles.pagination}>
            <span>
              Page {page + 1} of {totalPages} ({trades.length} trades)
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={styles.pageBtn(page === 0)}
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                style={styles.pageBtn(page >= totalPages - 1)}
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
