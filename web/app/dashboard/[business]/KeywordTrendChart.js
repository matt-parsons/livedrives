'use client';

import { useMemo } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';

const RANGE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

const TOOLTIP_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});

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

  return points
    .slice()
    .sort((a, b) => {
      const aTimestamp = Number(a?.timestamp ?? 0);
      const bTimestamp = Number(b?.timestamp ?? 0);
      return aTimestamp - bTimestamp;
    })
    .map((point) => {
      const timestamp = coerceNumber(point?.timestamp);
      const solvValue = coerceNumber(point?.solvTop3);
      const avgValue = coerceNumber(point?.avgPosition);

      const date = timestamp ? new Date(timestamp) : null;
      const fallbackLabel = typeof point?.label === 'string' && point.label.trim() ? point.label.trim() : '—';
      const axisLabel = date ? RANGE_LABEL_FORMATTER.format(date) : fallbackLabel;
      const tooltipLabel = date ? TOOLTIP_LABEL_FORMATTER.format(date) : fallbackLabel;

      return {
        axisLabel,
        tooltipLabel,
        solvTop3: solvValue !== null ? Number(solvValue.toFixed(1)) : null,
        avgPosition: avgValue !== null ? Number(avgValue.toFixed(2)) : null
      };
    });
}

function resolveTrendMessage(chartData) {
  if (!chartData.length) {
    return {
      icon: Minus,
      message: 'Awaiting enough runs to calculate a trend.',
      subtext: 'Hover over the chart to inspect run-by-run values.'
    };
  }

  const latest = chartData[chartData.length - 1];
  const previous = chartData[chartData.length - 2];

  if (!previous) {
    return {
      icon: Minus,
      message: 'Only one scan so far—collect more runs to see movement.',
      subtext: 'Hover over the chart to inspect run-by-run values.'
    };
  }

  const solvDelta =
    latest?.solvTop3 !== null && previous?.solvTop3 !== null
      ? latest.solvTop3 - previous.solvTop3
      : null;
  const avgDelta =
    latest?.avgPosition !== null && previous?.avgPosition !== null
      ? latest.avgPosition - previous.avgPosition
      : null;

  if (solvDelta !== null && Math.abs(solvDelta) >= 0.1) {
    const isPositive = solvDelta > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const changeLabel = `${Math.abs(solvDelta).toFixed(1)} pts`;
    const directionLabel = isPositive ? 'up' : 'down';

    return {
      icon: Icon,
      message: `SoLV moved ${directionLabel} ${changeLabel} since the last run.`,
      subtext: 'Higher SoLV reflects stronger local visibility in the top 3 map pins.'
    };
  }

  if (avgDelta !== null && Math.abs(avgDelta) >= 0.05) {
    const isImproving = avgDelta < 0;
    const Icon = isImproving ? TrendingUp : TrendingDown;
    const changeLabel = `${Math.abs(avgDelta).toFixed(2)} ranks`;
    const directionLabel = isImproving ? 'improved' : 'dropped';

    return {
      icon: Icon,
      message: `Avg position ${directionLabel} by ${changeLabel} versus the previous run.`,
      subtext: 'Lower average rank is better—keep tracking future scans for continued movement.'
    };
  }

  return {
    icon: Minus,
    message: 'Performance is holding steady compared to the last run.',
    subtext: 'Hover over the chart to inspect run-by-run values.'
  };
}

export default function KeywordTrendChart({ points }) {
  const chartData = useMemo(() => buildChartData(points), [points]);
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
  const rangeLabel = firstLabel && lastLabel ? `${firstLabel} – ${lastLabel}` : 'Last 30 days';

  if (!hasAnyData) {
    return (
      <Card className="border border-dashed border-border/60 bg-muted/40 shadow-none">
        <CardContent className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
          Not enough data to chart keyword performance over the last 30 days.
        </CardContent>
      </Card>
    );
  }

  const { icon: TrendIcon, message: trendMessage, subtext: trendSubtext } = resolveTrendMessage(chartData);

  return (
    <Card className="shadow-sm">
      <ChartContainer config={activeChartConfig} className="h-full">
        <CardHeader className="space-y-3 p-6 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Performance trend</CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </div>
          <ChartLegend className="pt-1" />
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
                <XAxis
                  dataKey="axisLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                {hasSolvData ? <YAxis yAxisId="solv" domain={[0, 100]} hide /> : null}
                {hasAvgData ? <YAxis yAxisId="avg" orientation="right" hide /> : null}
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {hasSolvData ? (
                  <Line
                    dataKey="solvTop3"
                    yAxisId="solv"
                    type="monotone"
                    stroke="var(--color-solvTop3)"
                    strokeWidth={2}
                    dot={false}
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
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
        <CardFooter className="flex items-start p-6 pt-0">
          <div className="flex w-full flex-col gap-1 text-sm">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <TrendIcon className="h-4 w-4" />
              <span>{trendMessage}</span>
            </div>
            <p className="text-xs text-muted-foreground">{trendSubtext}</p>
          </div>
        </CardFooter>
      </ChartContainer>
    </Card>
  );
}
