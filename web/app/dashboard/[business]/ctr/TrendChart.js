'use client';

function computeScale(values, fallbackMin, fallbackMax) {
  const filtered = values.filter((value) => typeof value === 'number' && Number.isFinite(value));

  if (!filtered.length) {
    return [fallbackMin, fallbackMax];
  }

  let min = Math.min(...filtered);
  let max = Math.max(...filtered);

  if (min === max) {
    const delta = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= delta;
    max += delta;
  }

  return [min, max];
}

function buildPathPoints(data, accessor, scale, invert, width, height, padding) {
  const step = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const [min, max] = scale;
  const range = max - min || 1;
  const points = [];
  const circles = [];

  data.forEach((entry, index) => {
    const value = accessor(entry);

    if (typeof value !== 'number' || Number.isNaN(value)) {
      points.push(null);
      return;
    }

    const progress = (value - min) / range;
    const normalized = invert ? 1 - progress : progress;
    const x = padding + step * index;
    const y = padding + (height - padding * 2) * normalized;

    points.push({ x, y });
    circles.push({ x, y, value });
  });

  let path = '';
  let active = false;

  points.forEach((point) => {
    if (!point) {
      active = false;
      return;
    }

    if (!active) {
      path += `M ${point.x} ${point.y}`;
      active = true;
    } else {
      path += ` L ${point.x} ${point.y}`;
    }
  });

  return { path, circles };
}

export default function TrendChart({ data, title }) {
  const width = 480;
  const height = 220;
  const padding = 36;

  const avgScale = computeScale(
    data.map((item) => item.avgPositionValue ?? null),
    1,
    20
  );

  const solvScale = computeScale(
    data.map((item) => item.solvTop3Value ?? null),
    0,
    100
  );

  const avgLine = buildPathPoints(
    data,
    (item) => item.avgPositionValue ?? null,
    avgScale,
    true,
    width,
    height,
    padding
  );

  const solvLine = buildPathPoints(
    data,
    (item) => item.solvTop3Value ?? null,
    solvScale,
    false,
    width,
    height,
    padding
  );

  const baselineY = height - padding;
  const xStep = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  return (
    <div className="ctr-trend-chart">
      <header>
        <h3>{title}</h3>
        <div className="legend">
          <span className="legend-item legend-item--avg">Avg position</span>
          <span className="legend-item legend-item--solv">SoLV %</span>
        </div>
      </header>
      <svg width={width} height={height} role="img" aria-label={`${title} trend`}>
        <line x1={padding} y1={baselineY} x2={width - padding} y2={baselineY} stroke="#d9d9d9" strokeWidth="1" />
        {avgLine.path ? (
          <path d={avgLine.path} fill="none" stroke="#0070f3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {solvLine.path ? (
          <path d={solvLine.path} fill="none" stroke="#2ba84a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {avgLine.circles.map((circle, index) => (
          <circle key={`avg-${index}`} cx={circle.x} cy={circle.y} r={4} fill="#0070f3" />
        ))}
        {solvLine.circles.map((circle, index) => (
          <circle key={`solv-${index}`} cx={circle.x} cy={circle.y} r={4} fill="#2ba84a" />
        ))}
        {data.map((item, index) => {
          const x = padding + xStep * index;
          return (
            <text key={`label-${item.label}-${index}`} x={x} y={height - padding + 18} textAnchor="middle" fontSize="12" fill="#555">
              {item.label}
            </text>
          );
        })}
      </svg>
      <style jsx>{`
        .ctr-trend-chart {
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          padding: 1rem;
          background-color: #ffffff;
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 0.5rem;
        }

        h3 {
          margin: 0;
          font-size: 1rem;
        }

        .legend {
          display: flex;
          gap: 1rem;
          font-size: 0.85rem;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .legend-item::before {
          content: '';
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 6px;
        }

        .legend-item--avg::before { background-color: #0070f3; }
        .legend-item--solv::before { background-color: #2ba84a; }
      `}</style>
    </div>
  );
}
