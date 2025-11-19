'use client';

function getTrendStatus(indicator) {
  if (!indicator || typeof indicator.className !== 'string') {
    return 'neutral';
  }

  if (indicator.className.includes('--positive')) {
    return 'positive';
  }

  if (indicator.className.includes('--negative')) {
    return 'negative';
  }

  return 'neutral';
}

const SUMMARY_TONES = {
  positive: {
    valueColor: '#0f5132',
    chipColor: '#0f5132',
    chipBg: 'rgba(15, 81, 50, 0.12)',
    border: 'rgba(15, 23, 42, 0.08)',
    shadow: '0 18px 32px rgba(15, 81, 50, 0.1)'
  },
  negative: {
    valueColor: '#991b1b',
    chipColor: '#b91c1c',
    chipBg: 'rgba(185, 28, 28, 0.12)',
    border: 'rgba(185, 28, 28, 0.18)',
    shadow: '0 18px 32px rgba(185, 28, 28, 0.06)'
  },
  neutral: {
    valueColor: '#111827',
    chipColor: '#4b5563',
    chipBg: 'rgba(148, 163, 184, 0.2)',
    border: 'rgba(148, 163, 184, 0.32)',
    shadow: '0 12px 28px rgba(15, 23, 42, 0.05)'
  }
};

export default function SummaryMetricCard({ title, valueLabel, indicator, deltaLabel }) {
  const status = getTrendStatus(indicator);
  const palette = SUMMARY_TONES[status] ?? SUMMARY_TONES.neutral;
  const indicatorText = indicator?.text ?? null;
  const indicatorIcon = indicator?.icon ?? '→';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '1.25rem 1.4rem',
        borderRadius: '20px',
        backgroundColor: '#ffffff',
        border: `1px solid ${palette.border}`,
      }}
    >
      <span
        style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#6b7280'
        }}
      >
        {title}
      </span>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem'
        }}
      >
        <span
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: palette.valueColor
          }}
        >
          {valueLabel}
        </span>
        {indicatorText ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.7rem',
              borderRadius: '999px',
              backgroundColor: palette.chipBg,
              color: palette.chipColor,
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            <span aria-hidden="true">{indicatorIcon}</span>
            <span>{indicatorText}</span>
          </span>
        ) : null}
      </div>
      {deltaLabel ? (
        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>30d change {deltaLabel}</span>
      ) : null}
    </div>
  );
}
