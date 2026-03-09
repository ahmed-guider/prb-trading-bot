import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface PriceChartProps {
  data: { date: string; value: number }[];
  title?: string;
  height?: number;
  color?: "green" | "red" | "blue";
  valuePrefix?: string;
}

const colorMap = {
  green: { stroke: "#22c55e", fill: "#22c55e" },
  red: { stroke: "#ef4444", fill: "#ef4444" },
  blue: { stroke: "#3b82f6", fill: "#3b82f6" },
};

const styles = {
  container: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  } as React.CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "#e1e4e8",
    marginBottom: 12,
  } as React.CSSProperties,
};

export default function PriceChart({
  data,
  title,
  height = 300,
  color = "green",
  valuePrefix = "$",
}: PriceChartProps) {
  const { stroke, fill } = colorMap[color];

  if (!data.length) {
    return (
      <div style={styles.container}>
        {title && <div style={styles.title}>{title}</div>}
        <div style={{ textAlign: "center", color: "#8b92a5", padding: 40, fontSize: 13 }}>
          No data available
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {title && <div style={styles.title}>{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.3} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d334844" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#8b92a5", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2d3348" }}
          />
          <YAxis
            tick={{ fill: "#8b92a5", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2d3348" }}
            tickFormatter={(v: number) =>
              `${valuePrefix}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            }
          />
          <Tooltip
            contentStyle={{
              background: "#1a1d27",
              border: "1px solid #2d3348",
              borderRadius: 8,
              fontSize: 12,
              color: "#e1e4e8",
            }}
            formatter={(v: number) => [
              `${valuePrefix}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              "Value",
            ]}
            labelStyle={{ color: "#8b92a5" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#gradient-${color})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
