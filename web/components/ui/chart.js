'use client';

import { createContext, useContext, useMemo } from 'react';
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
      className={cn('flex flex-wrap items-center gap-3 text-xs text-slate-600', className)}
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
            <span className="font-medium text-slate-700">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
