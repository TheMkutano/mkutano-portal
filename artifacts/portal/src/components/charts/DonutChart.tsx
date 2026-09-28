export interface DonutSlice {
  name: string;
  value: number;
}

interface DonutChartProps {
  data: DonutSlice[];
  colors?: string[];
  size?: number;
  holeRatio?: number;
  emptyMessage?: string;
}

// McKinsey categorical palette — blue-anchored, 8-series safe
const DEFAULT_COLORS = [
  "#0A2F5C",
  "#2A6FB0",
  "#4FA0C0",
  "#6C7A99",
  "#C99A3B",
  "#8E6FAE",
  "#4E8A66",
  "#BB6B4F",
  "#9ECAE1",
  "#6BAED6",
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeSlice(cx: number, cy: number, outerR: number, innerR: number, startAngle: number, endAngle: number) {
  const clampedEnd = Math.min(endAngle, startAngle + 359.99);
  const outerStart = polarToCartesian(cx, cy, outerR, clampedEnd);
  const outerEnd = polarToCartesian(cx, cy, outerR, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, clampedEnd);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function DonutChart({ data, colors = DEFAULT_COLORS, size = 120, holeRatio = 0.6, emptyMessage = "No data" }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size / 2) * 0.92;
  const innerR = outerR * holeRatio;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-xs text-gray-300 text-center">{emptyMessage}</p>
      </div>
    );
  }

  let currentAngle = 0;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const path = describeSlice(cx, cy, outerR, innerR, currentAngle, currentAngle + sweep);
    const midAngle = currentAngle + sweep / 2;
    const labelPt = polarToCartesian(cx, cy, (outerR + innerR) / 2, midAngle);
    currentAngle += sweep;
    return { ...d, path, labelPt, sweep, color: colors[i % colors.length] };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} opacity={0.92} />
      ))}
    </svg>
  );
}

export function DonutLegend({ data, colors = DEFAULT_COLORS }: { data: DonutSlice[]; colors?: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: colors[i % colors.length], opacity: 0.92 }}
          />
          <span className="text-xs text-gray-600 truncate flex-1">{d.name}</span>
          <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{d.value}</span>
          <span className="text-xs text-gray-400 w-8 text-right shrink-0">
            {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
