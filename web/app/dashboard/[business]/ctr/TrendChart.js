'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';

function coerceNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const chartConfig = {
  solvTop3: {
    label: 'SoLV top 3',
    color: 'hsl(var(--chart-1, 217 91% 60%))',
    format: (value) => `${value.toFixed(1)}%`
  },
  avgPosition: {
    label: 'Avg position',
    color: 'hsl(var(--chart-2, 222 47% 11%))',
    format: (value) => value.toFixed(2)
  }
};

function buildChartData(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.reduce((acc, entry) => {
    const solvValue = coerceNumber(entry?.solvTop3Value);
    const avgValue = coerceNumber(entry?.avgPositionValue);
    const hasSolvValue = solvValue !== null && solvValue !== 0;
    const hasAvgValue = avgValue !== null && avgValue !== 0;

    if (!hasSolvValue && !hasAvgValue) {
      return acc;
    }

    const label =
      typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : '—';

    acc.push({
      axisLabel: label,
      tooltipLabel: label,
      solvTop3: hasSolvValue ? Number(solvValue.toFixed(1)) : null,
      avgPosition: hasAvgValue ? Number(avgValue.toFixed(2)) : null
    });

    return acc;
  }, []);
}

export default function TrendChart({ data, title }) {
  const chartData = useMemo(() => buildChartData(data), [data]);
  const hasSolvData = chartData.some((entry) => entry.solvTop3 !== null);
  const hasAvgData = chartData.some((entry) => entry.avgPosition !== null);
  const activeChartConfig = useMemo(() => {
    const config = {};

    if (hasSolvData) {
      config.solvTop3 = chartConfig.solvTop3;
    }

    if (hasAvgData) {
      config.avgPosition = chartConfig.avgPosition;
    }

    return config;
  }, [hasSolvData, hasAvgData]);
  const hasAnyData = hasSolvData || hasAvgData;

  const firstLabel = chartData[0]?.tooltipLabel ?? null;
  const lastLabel = chartData[chartData.length - 1]?.tooltipLabel ?? null;
  const hasDistinctRange = firstLabel && lastLabel && firstLabel !== lastLabel;
  const rangeLabel = hasDistinctRange
    ? `${firstLabel} – ${lastLabel}`
    : firstLabel ?? 'Last 30 days';

  if (!hasAnyData) {
    return (
      <Card className="border border-dashed border-border/60 bg-muted/40 shadow-none">
        <CardContent className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
          Not enough data to chart CTR performance for this keyword.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <ChartContainer config={activeChartConfig} className="h-full">
        <CardHeader className="space-y-3 p-6 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              {rangeLabel ? <CardDescription>{rangeLabel}</CardDescription> : null}
            </div>
            <ChartLegend className="pt-1" />
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 12, right: 12, top: 12, bottom: 12 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="axisLabel" tickLine axisLine tickMargin={8} />
                {hasSolvData ? <YAxis yAxisId="solv" domain={[0, 100]} hide /> : null}
                {hasAvgData ? <YAxis yAxisId="avg" orientation="right" hide /> : null}
                <Tooltip />
                {hasSolvData ? (
                  <Line
                    dataKey="solvTop3"
                    yAxisId="solv"
                    type="monotone"
                    stroke="var(--color-solvTop3)"
                    strokeWidth={4}
                    dot
                    connectNulls
                    isAnimationActive
                  />
                ) : null}
                {hasAvgData ? (
                  <Line
                    dataKey="avgPosition"
                    yAxisId="avg"
                    type="monotone"
                    stroke="var(--color-avgPosition)"
                    strokeWidth={4}
                    dot
                    connectNulls
                    isAnimationActive
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </ChartContainer>
    </Card>
  );
}
