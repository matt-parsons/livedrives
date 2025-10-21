'use client';

import { useMemo } from 'react';
import { ChartContainer, ChartLegend } from '@/components/ui/chart';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const AVG_FORMATTER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOLV_FORMATTER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatAvgValue(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  return AVG_FORMATTER.format(numeric);
}

function formatSolvValue(value) {
  if (value === null || value === undefined) {
    return '—';
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  return `${SOLV_FORMATTER.format(numeric)}%`;
}

function buildDomain(values, { padding = 0.15, clampMin = null, clampMax = null } = {}) {
  const filtered = values.filter((value) => Number.isFinite(value));

  if (!filtered.length) {
    return null;
  }

  let min = Math.min(...filtered);
  let max = Math.max(...filtered);

  if (min === max) {
    const offset = Math.max(1, Math.abs(min) * 0.1);
    min -= offset;
    max += offset;
  } else {
    const range = max - min;
    min -= range * padding;
    max += range * padding;
  }

  if (clampMin !== null) {
    min = Math.max(min, clampMin);
  }

  if (clampMax !== null) {
    max = Math.min(max, clampMax);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return [min, max];
}

function generateTicks(domain, count = 4) {
  if (!domain || domain.length !== 2) {
    return [];
  }

  const [min, max] = domain;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }

  if (count <= 1 || min === max) {
    return [min];
  }

  const step = (max - min) / (count - 1);

  return Array.from({ length: count }, (_, index) => min + step * index);
}

function scaleLinearFactory(domain, innerHeight, { invert = false, margin }) {
  if (!domain || domain.length !== 2) {
    const center = margin.top + innerHeight / 2;
    return () => center;
  }

  const [domainMin, domainMax] = domain;
  const safeRange = domainMax - domainMin || 1;
  const top = margin.top;
  const bottom = margin.top + innerHeight;

  return (value) => {
    if (value === null || value === undefined) {
      return (top + bottom) / 2;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return (top + bottom) / 2;
    }

    let ratio = (numeric - domainMin) / safeRange;

    if (invert) {
      ratio = 1 - ratio;
    }

    const clamped = Math.max(0, Math.min(1, ratio));

    return top + (1 - clamped) * innerHeight;
  };
}

function createLine(points, xPositions, accessor, scaleY) {
  const coords = [];

  points.forEach((entry, index) => {
    const value = accessor(entry);

    if (value === null || value === undefined) {
      return;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return;
    }

    const x = xPositions[index];
    const y = scaleY(numeric);

    coords.push({ x, y, value: numeric });
  });

  if (!coords.length) {
    return { path: '', points: [] };
  }

  const path = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');

  return { path, points: coords };
}

function shouldShowLabel(index, total, step) {
  if (total <= 6) {
    return true;
  }

  if (index === 0 || index === total - 1) {
    return true;
  }

  return index % step === 0;
}

export default function KeywordTrendChart({ points }) {
  const chartData = useMemo(() => {
    if (!Array.isArray(points)) {
      return [];
    }

    return points
      .slice()
      .sort((a, b) => {
        const aValue = Number(a?.timestamp ?? 0);
        const bValue = Number(b?.timestamp ?? 0);
        return aValue - bValue;
      })
      .map((point) => {
        const timestamp = Number(point?.timestamp);
        const hasTimestamp = Number.isFinite(timestamp);
        const label = typeof point?.label === 'string' && point.label.trim()
          ? point.label
          : hasTimestamp
            ? DATE_FORMATTER.format(new Date(timestamp))
            : '—';
        const avgValue = Number(point?.avgPosition);
        const solvValue = Number(point?.solvTop3);

        return {
          timestamp: hasTimestamp ? timestamp : null,
          dateLabel: label,
          avgPosition: Number.isFinite(avgValue) ? avgValue : null,
          solvTop3: Number.isFinite(solvValue) ? solvValue : null
        };
      });
  }, [points]);

  const hasValues = chartData.some((entry) => entry.avgPosition !== null || entry.solvTop3 !== null);

  if (!chartData.length || !hasValues) {
    return (
      <div
        style={{
          borderRadius: '16px',
          border: '1px dashed rgba(148, 163, 184, 0.6)',
          backgroundColor: '#f9fafb',
          padding: '1.1rem 1.25rem',
          fontSize: '0.85rem',
          color: '#6b7280'
        }}
      >
        Not enough data to chart keyword performance over the last 30 days.
      </div>
    );
  }

  const width = 720;
  const height = 260;
  const margin = { top: 24, right: 64, bottom: 40, left: 64 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xPositions = chartData.map((_, index) => {
    if (chartData.length === 1) {
      return margin.left + innerWidth / 2;
    }

    const ratio = index / (chartData.length - 1);
    return margin.left + ratio * innerWidth;
  });

  const avgValues = chartData
    .map((entry) => entry.avgPosition)
    .filter((value) => value !== null);
  const solvValues = chartData
    .map((entry) => entry.solvTop3)
    .filter((value) => value !== null);

  const avgDomain = buildDomain(avgValues, { clampMin: 0 });
  const solvDomain = buildDomain(solvValues, { clampMin: 0, clampMax: 100 });

  const scaleAvg = scaleLinearFactory(avgDomain, innerHeight, { invert: true, margin });
  const scaleSolv = scaleLinearFactory(solvDomain, innerHeight, { invert: false, margin });

  const avgLine = createLine(chartData, xPositions, (entry) => entry.avgPosition, scaleAvg);
  const solvLine = createLine(chartData, xPositions, (entry) => entry.solvTop3, scaleSolv);

  const avgTicks = generateTicks(avgDomain);
  const solvTicks = generateTicks(solvDomain);

  const labelStep = chartData.length > 6 ? Math.ceil(chartData.length / 6) : 1;

  const chartConfig = {
    avgPosition: {
      label: 'Avg position',
      color: '#111827',
      valueFormatter: formatAvgValue
    },
    solvTop3: {
      label: 'SoLV (Top 3)',
      color: '#2563eb',
      valueFormatter: formatSolvValue
    }
  };

  return (
    <ChartContainer
      config={chartConfig}
      style={{
        borderRadius: '16px',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        backgroundColor: '#f9fafb',
        padding: '1.25rem 1.5rem'
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Line chart showing SoLV and average position over the last 30 days"
        style={{ width: '100%', height: '100%' }}
      >
        <rect x="0" y="0" width={width} height={height} fill="#f9fafb" rx="14" ry="14" />

        {avgTicks.map((value) => {
          const y = scaleAvg(value);

          return (
            <g key={`avg-grid-${value}`}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.2)"
                strokeWidth="1"
              />
              <line
                x1={margin.left - 6}
                x2={margin.left}
                y1={y}
                y2={y}
                stroke="rgba(107, 114, 128, 0.6)"
                strokeWidth="1"
              />
              <text
                x={margin.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6b7280"
              >
                {formatAvgValue(value)}
              </text>
            </g>
          );
        })}

        {solvTicks.map((value) => {
          const y = scaleSolv(value);

          return (
            <g key={`solv-tick-${value}`}>
              <line
                x1={width - margin.right}
                x2={width - margin.right + 6}
                y1={y}
                y2={y}
                stroke="rgba(37, 99, 235, 0.4)"
                strokeWidth="1"
              />
              <text
                x={width - margin.right + 10}
                y={y + 4}
                fontSize="11"
                fill="#3b82f6"
              >
                {formatSolvValue(value)}
              </text>
            </g>
          );
        })}

        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={height - margin.bottom}
          y2={height - margin.bottom}
          stroke="rgba(148, 163, 184, 0.5)"
          strokeWidth="1"
        />

        {chartData.map((entry, index) => {
          if (!shouldShowLabel(index, chartData.length, labelStep)) {
            return null;
          }

          const x = xPositions[index];

          return (
            <text
              key={`label-${index}`}
              x={x}
              y={height - margin.bottom + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#4b5563"
            >
              {entry.dateLabel}
            </text>
          );
        })}

        {avgLine.path ? (
          <path
            d={avgLine.path}
            fill="none"
            stroke="var(--chart-avgPosition)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {solvLine.path ? (
          <path
            d={solvLine.path}
            fill="none"
            stroke="var(--chart-solvTop3)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {avgLine.points.map((point, index) => (
          <circle
            key={`avg-point-${index}`}
            cx={point.x}
            cy={point.y}
            r="4.2"
            fill="#ffffff"
            stroke="var(--chart-avgPosition)"
            strokeWidth="2"
          >
            <title>{`${chartConfig.avgPosition.label}: ${formatAvgValue(point.value)}`}</title>
          </circle>
        ))}

        {solvLine.points.map((point, index) => (
          <circle
            key={`solv-point-${index}`}
            cx={point.x}
            cy={point.y}
            r="4.2"
            fill="#ffffff"
            stroke="var(--chart-solvTop3)"
            strokeWidth="2"
          >
            <title>{`${chartConfig.solvTop3.label}: ${formatSolvValue(point.value)}`}</title>
          </circle>
        ))}

        <text
          x={margin.left}
          y={margin.top - 8}
          fontSize="12"
          fill="#111827"
          fontWeight="600"
        >
          Avg position (lower is better)
        </text>

        <text
          x={width - margin.right}
          y={margin.top - 8}
          fontSize="12"
          fill="#1d4ed8"
          fontWeight="600"
          textAnchor="end"
        >
          SoLV (Top 3)
        </text>
      </svg>

      <ChartLegend style={{ marginTop: '0.75rem' }} />
    </ChartContainer>
  );
}
