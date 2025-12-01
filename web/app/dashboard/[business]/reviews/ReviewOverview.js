'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import SummaryMetricCard from '../SummaryMetricCard';
import GbpPostScheduler from './GbpPostScheduler';

function buildTrendIndicator(delta, { unit = '', invert = false, digits = 1 } = {}) {
  if (delta === null || delta === undefined) {
    return null;
  }

  const numericDelta = Number(delta);

  if (!Number.isFinite(numericDelta)) {
    return null;
  }

  const magnitude = Math.abs(numericDelta).toFixed(digits);
  const isImproving = invert ? numericDelta < 0 : numericDelta > 0;
  const isDeclining = invert ? numericDelta > 0 : numericDelta < 0;

  let className = 'trend-indicator--neutral';
  let icon = '→';
  let title = 'No change';

  if (isImproving) {
    className = 'trend-indicator--positive';
    icon = invert ? '▼' : '▲';
    title = 'Improving';
  } else if (isDeclining) {
    className = 'trend-indicator--negative';
    icon = invert ? '▲' : '▼';
    title = 'Declining';
  }

  const prefix = numericDelta > 0 ? '+' : '-';
  const text = `${prefix}${magnitude}${unit}`;

  return { className, icon, text, title };
}

function formatPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '0%';
  }

  return `${numeric.toFixed(0)}%`;
}

function SentimentBar({ label, value, tone }) {
  const colors = {
    positive: '#16a34a',
    neutral: '#6b7280',
    negative: '#dc2626'
  };

  const background = `${colors[tone] ?? '#0f172a'}22`;
  const widthValue = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span>{formatPercent(value)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${widthValue}%`,
            backgroundColor: colors[tone] ?? '#0f172a',
            boxShadow: `0 2px 8px ${background}`
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function VelocityRow({ label, count, helper }) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-border/60 bg-background/80 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
      <div className="text-2xl font-bold text-foreground">{count}</div>
    </div>
  );
}

export default function ReviewOverview({ snapshot, scheduledPosts = [], businessId, timezone }) {
  const ratingDelta = snapshot.averageRating.current - snapshot.averageRating.previous;
  const reviewDelta = snapshot.newReviewsThisWeek - snapshot.lastWeekReviews;
  const ratingIndicator = buildTrendIndicator(ratingDelta, { unit: '', digits: 2 });
  const reviewIndicator = buildTrendIndicator(reviewDelta, { unit: '', digits: 0 });
  const velocityDelta = snapshot.velocity.last7Days - snapshot.velocity.prior7Days;
  const velocityIndicator = buildTrendIndicator(velocityDelta, { unit: '', digits: 0 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">Review Monitoring</p>
          <h1 className="text-3xl font-semibold text-foreground">Reviews</h1>
          <p className="text-base text-muted-foreground">
            Track fresh feedback, rating movement, and the velocity of customer reviews across the past month.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryMetricCard
          title="New reviews this week"
          valueLabel={`${snapshot.newReviewsThisWeek}`}
          indicator={reviewIndicator}
          deltaLabel={`vs ${snapshot.lastWeekReviews} last week`}
        />
        <SummaryMetricCard
          title="Average rating trend"
          valueLabel={`${snapshot.averageRating.current.toFixed(1)} ★`}
          indicator={ratingIndicator}
          deltaLabel={`from ${snapshot.averageRating.previous.toFixed(1)} prior period`}
        />
        <SummaryMetricCard
          title="Review velocity"
          valueLabel={`${snapshot.velocity.last7Days} in 7d`}
          indicator={velocityIndicator}
          deltaLabel={`30d pace: ${snapshot.velocity.last30Days} total`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>Average rating trend</CardTitle>
            <CardDescription>Week-over-week movement pulled from recent public reviews.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ChartContainer
              config={{ rating: { label: 'Average rating', color: 'hsl(var(--chart-1, 221 83% 53%))' } }}
              className="h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot.ratingHistory} margin={{ top: 10, bottom: 10, left: 0, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#9ca3af"
                    domain={[3, 5]}
                    tickFormatter={(value) => value.toFixed(1)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip cursor={{ strokeDasharray: '4 4', stroke: '#cbd5e1' }} content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="rating" stroke="var(--chart-rating)" strokeWidth={2.4} dot />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>Sentiment summary</CardTitle>
            <CardDescription>How customers feel about recent experiences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SentimentBar label="Positive" value={snapshot.sentiment.positive} tone="positive" />
            <SentimentBar label="Neutral" value={snapshot.sentiment.neutral} tone="neutral" />
            <SentimentBar label="Negative" value={snapshot.sentiment.negative} tone="negative" />
            <div className="rounded-lg bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
              {snapshot.sentiment.summary}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Top themes</p>
              <ul className="flex flex-wrap gap-2">
                {snapshot.sentiment.themes.map((theme) => (
                  <li
                    key={theme}
                    className="rounded-full bg-background px-3 py-1 text-sm font-medium text-foreground shadow-sm"
                  >
                    {theme}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Review velocity</CardTitle>
          <CardDescription>Compare short-term and monthly review intake to keep momentum steady.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <VelocityRow
            label="Last 7 days"
            count={snapshot.velocity.last7Days}
            helper={`Up from ${snapshot.velocity.prior7Days} the week before.`}
          />
          <VelocityRow
            label="Last 30 days"
            count={snapshot.velocity.last30Days}
            helper="Target: 30-40 reviews every month for ranking strength."
          />
          <VelocityRow
            label="Projected next 30 days"
            count={snapshot.velocity.projectedNext30Days}
            helper="Based on the trailing 14-day pace."
          />
        </CardContent>
      </Card>

      <GbpPostScheduler
        businessId={businessId}
        timezone={timezone}
        initialPosts={scheduledPosts}
      />
    </div>
  );
}
