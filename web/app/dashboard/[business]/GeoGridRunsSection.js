'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Divider,
  ScrollShadow,
  Tab,
  Tabs,
  Tooltip
} from '@heroui/react';

const VIEW_OPTIONS = [
  { id: 'trend', label: 'Keyword trend' },
  { id: 'list', label: 'Detailed runs' }
];

function normalizeView(value) {
  return value === 'list' ? 'list' : 'trend';
}

function resolveTrendTone(indicator) {
  if (!indicator || typeof indicator !== 'object') {
    return { color: 'default', icon: '→', text: '—', title: 'No comparison' };
  }

  const tone = indicator.className?.includes('--positive')
    ? 'success'
    : indicator.className?.includes('--negative')
      ? 'danger'
      : 'default';

  return {
    color: tone,
    icon: indicator.icon ?? '→',
    text: indicator.text ?? '—',
    title: indicator.title ?? indicator.description ?? 'Trend'
  };
}

function MetricChip({ label, value, indicator, unit }) {
  const trend = resolveTrendTone(indicator);
  return (
    <div className="flex items-center gap-2 rounded-full bg-content2/80 px-3 py-1 text-sm font-medium text-foreground">
      <span className="text-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{value}{unit}</span>
      <Tooltip content={trend.title} placement="top">
        <Chip size="sm" color={trend.color} variant="flat" className="font-semibold">
          <span className="flex items-center gap-1">
            <span aria-hidden>{trend.icon}</span>
            <span>{trend.text}</span>
          </span>
        </Chip>
      </Tooltip>
    </div>
  );
}

function TrendSummary({ label, dataset, indicator, unit = '' }) {
  const start = dataset?.first ?? '—';
  const end = dataset?.latest ?? '—';
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-xl border border-content3/40 bg-content2/70 p-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground/60">
        <span>{label}</span>
        <span className="text-foreground/50">Last 30d</span>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-foreground/50">First</span>
          <span className="text-lg font-semibold text-foreground">{start}{unit}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-foreground/50">Latest</span>
          <span className="text-lg font-semibold text-foreground">{end}{unit}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm text-foreground/70">
        <span>Change</span>
        <Chip color={resolveTrendTone(indicator).color} variant="flat" size="sm">
          <span className="flex items-center gap-1 font-semibold">
            <span aria-hidden>{resolveTrendTone(indicator).icon}</span>
            <span>{resolveTrendTone(indicator).text}</span>
          </span>
        </Chip>
      </div>
    </div>
  );
}

export default function GeoGridRunsSection({ caption, defaultView = 'trend', trendItems, runItems }) {
  const [activeView, setActiveView] = useState(() => normalizeView(defaultView));

  const tabs = useMemo(
    () =>
      VIEW_OPTIONS.map((option) => ({
        key: option.id,
        title: option.label
      })),
    []
  );

  const handleSelectionChange = (key) => {
    const nextView = normalizeView(key?.toString());
    setActiveView(nextView);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextView === 'list') {
        url.searchParams.set('view', 'list');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url);
    }
  };

  const renderTrendView = () => {
    if (!trendItems.length) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-content3/60 bg-content2/60 px-6 py-10 text-center">
          <h3 className="text-lg font-semibold text-foreground">No keyword trends yet</h3>
          <p className="max-w-md text-sm text-foreground/70">
            Accumulate multiple runs per keyword to unlock trend comparisons and geographic visualizations.
          </p>
        </div>
      );
    }

    return (
      <ScrollShadow className="grid gap-4">
        {trendItems.map((item) => {
          const avgTrendRaw = item.avgTrendIndicator;
          const solvTrendRaw = item.solvTrendIndicator;
          const avgTrend = resolveTrendTone(avgTrendRaw);
          const solvTrend = resolveTrendTone(solvTrendRaw);
          return (
            <Card key={item.key} radius="lg" className="border border-content3/40 bg-content1/80">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" color="secondary" variant="flat" className="font-semibold">
                      {item.runCount} runs
                    </Chip>
                    <span className="text-xs uppercase tracking-wide text-foreground/50">
                      {item.firstRunDate} → {item.latestRunDate}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">{item.keyword}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <MetricChip
                    label="SoLV"
                    value={item.solv?.latest ?? '—'}
                    unit="%"
                    indicator={item.solvTrendIndicator}
                  />
                  <MetricChip
                    label="Avg position"
                    value={item.avg?.latest ?? '—'}
                    indicator={item.avgTrendIndicator}
                  />
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="grid gap-4 md:grid-cols-2">
                <TrendSummary label="Avg position" dataset={item.avg} indicator={avgTrendRaw} />
                <TrendSummary label="SoLV (Top 3)" dataset={item.solv} indicator={solvTrendRaw} unit="%" />
              </CardBody>
              <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground/70">
                <span>
                  Latest run updated {item.latestRunDate ?? '—'}
                  {item.latestRunHref ? (
                    <>
                      {' · '}
                      <Link className="font-semibold text-primary" href={item.latestRunHref}>
                        View run ↗
                      </Link>
                    </>
                  ) : null}
                </span>
                <Chip variant="flat" color={avgTrend.color} size="sm" className="font-semibold">
                  Avg trend {avgTrend.text}
                </Chip>
              </CardFooter>
            </Card>
          );
        })}
      </ScrollShadow>
    );
  };

  const renderListView = () => {
    if (!runItems.length) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-content3/60 bg-content2/60 px-6 py-10 text-center">
          <h3 className="text-lg font-semibold text-foreground">No geo grid runs yet</h3>
          <p className="max-w-md text-sm text-foreground/70">
            Deploy a run to start mapping rankings across your coverage area and unlock keyword trend comparisons.
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        {runItems.map((run) => {
          const solvTrend = resolveTrendTone(run.solvTrendIndicator);
          const avgTrend = resolveTrendTone(run.avgTrendIndicator);
          return (
            <Card
              as={Link}
              href={run.href}
              key={run.id}
              isPressable
              radius="lg"
              className="border border-content3/40 bg-content1/80 transition-transform hover:scale-[1.01]"
            >
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-foreground/60">{run.runDate}</p>
                  <h3 className="text-xl font-semibold text-foreground">{run.keyword}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <MetricChip label="SoLV" value={run.solvTop3} unit="" indicator={run.solvTrendIndicator} />
                  <MetricChip label="Avg position" value={run.avgPosition} indicator={run.avgTrendIndicator} />
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="flex flex-wrap gap-3 text-sm text-foreground/70">
                {run.gridDetails.map((detail) => (
                  <Chip key={detail} variant="flat" color="secondary" size="sm">
                    {detail}
                  </Chip>
                ))}
              </CardBody>
              <CardFooter className="flex flex-col gap-2 text-xs text-foreground/60 sm:flex-row sm:justify-between sm:text-sm">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {run.footerDetails.map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </div>
                {run.notes ? (
                  <span className="rounded-lg bg-warning/20 px-3 py-1 text-warning-600">Notes: {run.notes}</span>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="border border-content3/40 bg-content1/90 shadow-large">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Geo grid runs</h2>
          <p className="text-sm text-foreground/60">{caption}</p>
        </div>
        <Tabs
          aria-label="Geo grid view mode"
          color="secondary"
          selectedKey={activeView}
          onSelectionChange={handleSelectionChange}
          variant="bordered"
        >
          {tabs.map((tab) => (
            <Tab key={tab.key} title={tab.title} />
          ))}
        </Tabs>
      </CardHeader>
      <Divider />
      <CardBody className="space-y-4">
        {activeView === 'trend' ? renderTrendView() : renderListView()}
      </CardBody>
    </Card>
  );
}
