import { formatDecimal } from './runs/formatters';

export function buildRunTrendIndicator(delta, { invert = false, unit = '', digits = 1 } = {}) {
  if (delta === null || delta === undefined) {
    return null;
  }

  const value = Number(delta);

  if (!Number.isFinite(value)) {
    return null;
  }

  const magnitudeStr = formatDecimal(Math.abs(value), digits);

  if (magnitudeStr === null) {
    return null;
  }

  const magnitudeNumeric = Number(magnitudeStr);

  if (Number.isNaN(magnitudeNumeric)) {
    return null;
  }

  const isImproving = invert ? value < 0 : value > 0;
  const isDeclining = invert ? value > 0 : value < 0;

  if (magnitudeNumeric === 0) {
    return {
      className: 'trend-indicator--neutral',
      icon: '→',
      text: `0${unit}`,
      title: 'No change'
    };
  }

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

  const prefix = value > 0 ? '+' : '-';
  const text = `${prefix}${magnitudeStr}${unit}`;

  return { className, icon, text, title };
}
