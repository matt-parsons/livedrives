'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import BusinessOptimizationRoadmap from './BusinessOptimizationRoadmap';
import NextStepsPanel from './NextStepsPanel';
import { selectNextOptimizationSteps } from './optimization';

const POLLING_INTERVAL = 5000; // 5 seconds

export default function OptimizationRoadmapClient({ placeId, businessId = null, editHref, optimizationHref }) {
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [meta, setMeta] = useState(null);

  const fetchData = useCallback(async (controller) => {
    if (!placeId) {
      setLoading(false);
      setError(null);
      setRoadmap(null);
      setMeta(null);
      return;
    }

    setLoading(true);
    setError(null);

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
      if (!controller.signal.aborted) {
        setRoadmap(payload?.data?.roadmap ?? null);
        setMeta(payload?.data?.meta ?? null);
        setError(null);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message || 'Failed to load optimization data.');
        setRoadmap(null);
        setMeta(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [placeId, businessId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller);

    return () => {
      controller.abort();
    };
  }, [fetchData]);

  useEffect(() => {
  console.log('poll posts useEffect - meta:', meta);
  console.log('sidebarPending:', meta?.sidebarPending);
  console.log('postsTaskId:', meta?.postsTaskId);

    if (!meta?.sidebarPending || !meta?.postsTaskId) {
      return;
    }

    const controller = new AbortController();
    const timerId = setTimeout(() => {
      const poll = async () => {
        console.log('poll posts');
        try {
          const response = await fetch(`/api/places/posts-status/${meta.postsTaskId}`, {
            signal: controller.signal
          });
          const data = await response.json();
          if (data.isComplete && !controller.signal.aborted) {
            // Data is ready, re-fetch the main data
            fetchData(new AbortController());
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error('Polling failed:', err);
          }
        }
      };
      poll();
    }, POLLING_INTERVAL);

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [meta, fetchData]);

  const nextSteps = useMemo(() => selectNextOptimizationSteps(roadmap), [roadmap]);
  const shouldShowNextSteps = Boolean(placeId);

  const roadmapContent = loading && !roadmap ? (
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
