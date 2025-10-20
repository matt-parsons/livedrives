'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Divider,
  Tab,
  Tabs
} from '@heroui/react';
import GeoGridMap from './runs/[runId]/GeoGridMap';

function resolveTrendTone(indicator) {
  if (!indicator || typeof indicator !== 'object') {
    return { color: 'default', icon: '→', text: '—', label: 'No comparison available' };
  }

  const className = indicator.className ?? '';
  const color = className.includes('--positive')
    ? 'success'
    : className.includes('--negative')
      ? 'danger'
      : 'secondary';

  return {
    color,
    icon: indicator.icon ?? '→',
    text: indicator.text ?? '—',
    label: indicator.title ?? indicator.description ?? 'Trend'
  };
}

function MetricPanel({ label, value, delta, indicator }) {
  const tone = resolveTrendTone(indicator);
  return (
    <div className="rounded-2xl border border-content3/50 bg-content2/80 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{label}</div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-semibold text-foreground">{value}</span>
        <Chip color={tone.color} variant="flat" size="sm" className="font-semibold" title={tone.label}>
          <span className="flex items-center gap-1">
            <span aria-hidden>{tone.icon}</span>
            <span>{tone.text}</span>
          </span>
        </Chip>
      </div>
      {delta ? (
        <p className="mt-2 text-xs text-foreground/60">30d change {delta}</p>
      ) : null}
    </div>
  );
}

export default function KeywordPerformanceSpotlight({ items, mapsApiKey }) {
  const keywordItems = useMemo(() => items ?? [], [items]);
  const [activeKey, setActiveKey] = useState(() => keywordItems[0]?.key ?? null);

  useEffect(() => {
    if (!keywordItems.length) {
      setActiveKey(null);
      return;
    }

    if (!keywordItems.some((item) => item.key === activeKey)) {
      setActiveKey(keywordItems[0]?.key ?? null);
    }
  }, [keywordItems, activeKey]);

  const activeItem = useMemo(() => {
    if (!keywordItems.length) {
      return null;
    }

    return keywordItems.find((item) => item.key === activeKey) ?? keywordItems[0];
  }, [keywordItems, activeKey]);

  if (!activeItem) {
    return null;
  }

  const tabs = keywordItems.map((item) => ({ key: item.key, title: item.keyword }));
  const hasTabs = tabs.length > 1;

  const solvTone = resolveTrendTone(activeItem.solvTrendIndicator);
  const avgTone = resolveTrendTone(activeItem.avgTrendIndicator);

  return (
    <Card className="border border-content3/40 bg-content1/90 shadow-large">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-foreground/50">
            <Chip size="sm" variant="flat" color="secondary" className="font-semibold">
              Keyword spotlight
            </Chip>
            <span>Runs analysed · {activeItem.runCount}</span>
          </div>
          <h3 className="text-2xl font-semibold text-foreground">{activeItem.keyword}</h3>
          <p className="text-sm text-foreground/60">Latest run captured {activeItem.latestRunDate}</p>
        </div>
        {hasTabs ? (
          <Tabs
            aria-label="Keyword selector"
            selectedKey={activeItem.key}
            onSelectionChange={(key) => setActiveKey(key?.toString())}
            color="secondary"
            variant="bordered"
            classNames={{ tabList: 'max-w-full overflow-x-auto' }}
          >
            {tabs.map((tab) => (
              <Tab key={tab.key} title={tab.title} />
            ))}
          </Tabs>
        ) : null}
      </CardHeader>
      <Divider />
      <CardBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricPanel
              label="SoLV (Top 3)"
              value={activeItem.solvLabel}
              delta={activeItem.solvDeltaLabel}
              indicator={activeItem.solvTrendIndicator}
            />
            <MetricPanel
              label="Average position"
              value={activeItem.avgLabel}
              delta={activeItem.avgDeltaLabel}
              indicator={activeItem.avgTrendIndicator}
            />
          </div>

          <Card radius="lg" variant="bordered" className="border-content3/40 bg-content2/70">
            <CardBody className="space-y-2 text-sm text-foreground/70">
              <p>
                {activeItem.runCount} geo grid run{activeItem.runCount === 1 ? '' : 's'} have been captured for this
                keyword in the last 30 days. The latest run tracked on {activeItem.latestRunDate} shows a
                {` ${solvTone.text}`} SoLV trend and {` ${avgTone.text}`} average position change.
              </p>
              <p>
                Use this insight to prioritise campaign adjustments, routing improvements, and keyword refreshes.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="min-h-[280px] rounded-2xl border border-content3/40 bg-content2/60">
          {activeItem.latestRunMap && mapsApiKey ? (
            <GeoGridMap
              apiKey={mapsApiKey}
              center={activeItem.latestRunMap.center}
              points={activeItem.latestRunMap.points}
              interactive={false}
              minHeight="360px"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <h4 className="text-lg font-semibold text-foreground">Map preview unavailable</h4>
              <p className="text-sm text-foreground/60">
                We need a recent geo grid run and Google Maps access to render keyword performance tiles.
              </p>
            </div>
          )}
        </div>
      </CardBody>
      <Divider />
      <CardFooter className="flex flex-col gap-2 text-sm text-foreground/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Chip variant="flat" color={solvTone.color} size="sm">
            SoLV trend {solvTone.text}
          </Chip>
          <Chip variant="flat" color={avgTone.color} size="sm">
            Avg position trend {avgTone.text}
          </Chip>
        </div>
        {activeItem.latestRunHref ? (
          <Link className="font-semibold text-primary" href={activeItem.latestRunHref}>
            Open latest run ↗
          </Link>
        ) : null}
      </CardFooter>
    </Card>
  );
}
