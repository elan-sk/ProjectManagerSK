/** Gráfico de dona (SVG puro, sin librería) con leyenda en % — para distribuciones (estado, riesgo, alertas). */
export function DonutChart({
  data,
  size = 112,
  strokeWidth = 16,
}: {
  data: { label: string; value: number; colorClass: string; colorHex: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 flex-shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        {total > 0 &&
          data
            .filter((d) => d.value > 0)
            .map((d) => {
              const dash = (d.value / total) * circumference;
              const el = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={d.colorHex}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offsetAcc}
                />
              );
              offsetAcc += dash;
              return el;
            })}
      </svg>
      <ul className="space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${d.colorClass}`} />
            <span className="text-slate-600">{d.label}</span>
            <span className="font-medium text-slate-900">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}% ({d.value})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
