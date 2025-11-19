'use client';

import { useEffect, useMemo, useState } from 'react';
import BusinessOptimizationRoadmap from './BusinessOptimizationRoadmap';
import NextStepsPanel from './NextStepsPanel';
import { selectNextOptimizationSteps } from './optimization';

export default function OptimizationRoadmapClient({ placeId, businessId = null, editHref, optimizationHref }) {
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(null);
  const [roadmap, setRoadmap] = useState(null);

  useEffect(() => {
    if (!placeId) {
      setLoading(false);
      setError(null);
      setRoadmap(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setRoadmap(null);

      try {
        const params = new URLSearchParams({ placeId });
        if (businessId) {
          params.set('businessId', String(businessId));
        }

        const response = await fetch(`/api/optimization-data?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (isMounted) {
          setRoadmap(payload?.data?.roadmap ?? null);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          setError(err.message || 'Failed to load optimization data.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [placeId, businessId]);

  const nextSteps = useMemo(() => selectNextOptimizationSteps(roadmap), [roadmap]);
  const shouldShowNextSteps = Boolean(placeId);

  const roadmapContent = loading ? (
    <div className="surface-card surface-card--muted surface-card--compact">
      <div className="section-header">
        <div>
          <h2 className="section-title">Optimization roadmap</h2>
          <p className="section-caption">Gathering Google Profile insights…</p>
        </div>
      </div>
      <p className="business-optimization-roadmap__connect-message">
        Hang tight while we pull the latest details from Google.
      </p>
    </div>
  ) : (
    <BusinessOptimizationRoadmap roadmap={roadmap} error={error} placeId={placeId} editHref={editHref} />
  );

  return (
    <>
      {shouldShowNextSteps ? (
        <NextStepsPanel
          steps={nextSteps}
          optimizationHref={optimizationHref}
          loading={loading}
          error={error}
          businessId={businessId}
        />
      ) : null}

      <section className="section">{roadmapContent}</section>
    </>
  );
}
