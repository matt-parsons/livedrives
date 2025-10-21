'use client';

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo
} from 'react';
import { Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

const ChartConfigContext = createContext({});

export function useChartConfig() {
  return useContext(ChartConfigContext) ?? {};
}

export function ChartContainer({ config = {}, className = '', style = {}, children, ...props }) {
  const cssVariables = useMemo(() => {
    const variables = {};

    Object.entries(config).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        if (value.color) {
          variables[`--chart-${key}`] = value.color;
          variables[`--color-${key}`] = value.color;
        }

        if (value.background) {
          variables[`--chart-${key}-bg`] = value.background;
        }
      }
    });

    return variables;
  }, [config]);

  return (
    <ChartConfigContext.Provider value={config}>
      <div
        className={cn('relative flex w-full flex-col', className)}
        style={{ ...cssVariables, ...style }}
        {...props}
      >
        {children}
      </div>
    </ChartConfigContext.Provider>
  );
}

export function ChartLegend({ className = '', style = {}, ...props }) {
  const config = useChartConfig();
  const entries = Object.entries(config);

  if (!entries.length) {
    return null;
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 text-xs text-muted-foreground', className)}
      style={style}
      {...props}
    >
      {entries.map(([key, value]) => {
        const color = value?.color ?? 'currentColor';
        const label = value?.label ?? key;

        return (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="font-medium text-foreground">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ChartTooltip({ content, cursor = { strokeDasharray: '3 3', strokeWidth: 1 }, ...props }) {
  return (
    <Tooltip
      {...props}
      cursor={cursor}
      content={(tooltipProps) => {
        if (typeof content === 'function') {
          return content(tooltipProps);
        }

        if (isValidElement(content)) {
          return cloneElement(content, tooltipProps);
        }

        return null;
      }}
    />
  );
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  indicator = 'dot',
  hideLabel = false,
  className = '',
  ...props
}) {
  const config = useChartConfig();
  const items = (payload ?? []).filter((item) => item && item.dataKey && item.value !== undefined && item.value !== null);

  if (!active || !items.length) {
    return null;
  }

  const resolvedLabel = payload?.[0]?.payload?.tooltipLabel ?? label;

  return (
    <div
      className={cn(
        'grid min-w-[180px] gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md',
        className
      )}
      {...props}
    >
      {!hideLabel && resolvedLabel ? (
        <div className="font-medium text-muted-foreground">{resolvedLabel}</div>
      ) : null}
      <div className="grid gap-1">
        {items.map((item) => {
          const key = item.dataKey;
          const entry = config?.[key] ?? {};
          const color = entry.color ?? item.color ?? item.stroke ?? 'currentColor';
          const formatter = entry.format ?? entry.valueFormatter;
          const formattedValue = typeof formatter === 'function' ? formatter(item.value, item.payload) : item.value;
          const displayValue = formattedValue ?? '—';

          return (
            <div key={key} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    indicator === 'line' ? 'h-0.5 w-4 rounded-sm' : 'h-2 w-2 rounded-full'
                  )}
                  style={{ backgroundColor: color }}
                />
                <span className="text-muted-foreground">{entry.label ?? key}</span>
              </div>
              <span className="font-medium text-foreground">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
