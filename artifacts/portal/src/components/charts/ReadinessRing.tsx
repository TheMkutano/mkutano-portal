interface ReadinessRingProps {
  score: number;
  rawScore?: number;
  size?: number;
}

const RADIUS = 52;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score: number): string {
  if (score >= 75) return "#2E7D5B"; // status-completed
  if (score >= 50) return "#2A6FB0"; // brand-primary
  return "#B5462F";                  // status-blocked
}

export function ReadinessRing({ score, rawScore, size = 140 }: ReadinessRingProps) {
  const pct = Math.min(100, Math.max(0, score));
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  const color = scoreColor(score);
  const isCapped = rawScore !== undefined && rawScore > score;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        className="absolute inset-0 -rotate-90"
      >
        {/* track */}
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#f0f0f0" strokeWidth={STROKE} />
        {/* uncapped ghost arc */}
        {isCapped && rawScore !== undefined && (
          <circle
            cx="60" cy="60" r={RADIUS}
            fill="none"
            stroke={color}
            strokeOpacity={0.2}
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE - (rawScore / 100) * CIRCUMFERENCE}
            strokeLinecap="round"
          />
        )}
        {/* filled arc */}
        <circle
          cx="60" cy="60" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* centred label */}
      <div className="flex flex-col items-center leading-none z-10">
        <span className="text-3xl font-light tabular-nums text-foreground">{score}</span>
        <span className="text-xs text-gray-400 mt-0.5">/100</span>
      </div>
    </div>
  );
}
