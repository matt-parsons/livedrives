'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

const TYPING_INTERVAL_MS = 5;

function buildOpportunityMessage(text) {
  if (!text) return '';

  return text.replace(/\b(issues?|problems?|weaknesses?)\b/gi, (match) => `${match} (opportunity)`);
}

export default function ReviewAiOverviewCard({ businessId = null, businessName = '', isReady = false }) {
  const [overview, setOverview] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const typingIntervalRef = useRef(null);

  const subtitle = useMemo(() => {
    if (!businessName) return 'Live guidance once your data is ready';
    return `Review overview tailored for ${businessName}`;
  }, [businessName]);

  const fetchOverview = useCallback(async () => {
    if (!businessId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/businesses/${businessId}/reviews/latest`, {
        cache: 'no-store'
      });
      const body = await response.text();

      if (!response.ok) {
        let errorMessage = 'Unable to generate AI overview right now.';
        try {
          errorMessage = JSON.parse(body).error || errorMessage;
        } catch {
          if (body) errorMessage = body;
        }
        throw new Error(errorMessage);
      }

      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch (err) {
        throw new Error('Received an unexpected response while generating the overview.');
      }

      const safeOverview = buildOpportunityMessage(payload?.snapshot?.sentiment?.summary || '');
      setOverview(safeOverview);
    } catch (err) {
      setError(err?.message || 'Unable to generate AI overview right now.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!isReady || !businessId) {
      return undefined;
    }

    fetchOverview();
  }, [fetchOverview, isReady, businessId]);

  useEffect(() => {
    if (!overview) {
      setDisplayedText('');
      return undefined;
    }

    let index = 0;
    setDisplayedText('');

    typingIntervalRef.current = setInterval(() => {
      index += 1;
      setDisplayedText(overview.slice(0, index));

      if (index >= overview.length && typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    }, TYPING_INTERVAL_MS);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [overview]);

  const statusLabel = loading ? 'Thinking…' : overview ? 'Live AI' : 'Ready';
  const helperText = error || '';

  return (
    <section className="ai-overview-card" aria-live="polite">
      <div className="ai-overview-card__glow" aria-hidden="true" />
      <div className="ai-overview-card__header">
        <div className="ai-overview-card__title">
          <span className="ai-overview-card__icon" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="ai-overview-card__eyebrow">AI overview</p>
            <p className="ai-overview-card__subtitle">{subtitle}</p>
          </div>
        </div>
        <span className={`ai-overview-card__badge${loading ? ' ai-overview-card__badge--pulse' : ''}`}>{statusLabel}</span>
      </div>

      <div className={`ai-overview-card__body${loading ? ' ai-overview-card__body--loading' : ''}`}>
        {displayedText ? (
          <p className="ai-overview-card__text">
            {displayedText}
            <span className="ai-overview-card__cursor" aria-hidden="true" />
          </p>
        ) : (
          <p className="ai-overview-card__placeholder">
            {loading ? 'Generating a quick readout of your profile…' : 'Hang tight. We are loading your snapshot now.'}
          </p>
        )}
      </div>

      <p className="ai-overview-card__helper">{helperText}</p>
    </section>
  );
}
