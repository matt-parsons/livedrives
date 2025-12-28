'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import BusinessOptimizationRoadmap from './BusinessOptimizationRoadmap';
import NextStepsPanel from './NextStepsPanel';
import { selectNextOptimizationSteps } from './optimization';

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_POSTS_POLL_MS = 120_000;
const MAX_POSTS_TASK_RESETS = 1;

export default function OptimizationRoadmapClient({ placeId, businessId = null, editHref, optimizationHref }) {
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [meta, setMeta] = useState(null);

  const fetchData = useCallback(async (controller, { forceRefresh = false, resetPostsTask = false } = {}) => {
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
      if (forceRefresh) {
        params.set('forceRefresh', '1');
      }
      if (resetPostsTask) {
        params.set('resetPostsTask', '1');
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

  const postsPollingRef = useRef({
    lastTaskId: null,
    startedAt: 0,
    resetCount: 0,
    initialResetDone: false
  });
  const postsResettingRef = useRef(false);

  useEffect(() => {
  console.log('poll posts useEffect - meta:', meta);
  console.log('sidebarPending:', meta?.sidebarPending);
  console.log('postsTaskId:', meta?.postsTaskId);

    if (!meta?.sidebarPending || !meta?.postsTaskId) {
      postsPollingRef.current = { lastTaskId: null, startedAt: 0, resetCount: 0, initialResetDone: false };
      return;
    }

    const controller = new AbortController();
    let inFlight = false;

    const poll = async () => {
      if (inFlight || controller.signal.aborted || postsResettingRef.current) return;
      inFlight = true;
      try {
        const now = Date.now();
        if (!postsPollingRef.current.initialResetDone) {
          postsPollingRef.current.initialResetDone = true;
          postsPollingRef.current.startedAt = now;
          postsResettingRef.current = true;
          try {
            await fetchData(new AbortController(), { forceRefresh: true, resetPostsTask: true });
          } finally {
            postsResettingRef.current = false;
          }
          return;
        }
        if (postsPollingRef.current.lastTaskId !== meta.postsTaskId) {
          postsPollingRef.current.lastTaskId = meta.postsTaskId;
          postsPollingRef.current.startedAt = now;
        } else if (!postsPollingRef.current.startedAt) {
          postsPollingRef.current.startedAt = now;
        }

        if (now - postsPollingRef.current.startedAt > MAX_POSTS_POLL_MS) {
          if (postsPollingRef.current.resetCount < MAX_POSTS_TASK_RESETS) {
            postsPollingRef.current.resetCount += 1;
            postsPollingRef.current.startedAt = now;
            postsResettingRef.current = true;
            try {
              await fetchData(new AbortController(), { forceRefresh: true, resetPostsTask: true });
            } finally {
              postsResettingRef.current = false;
            }
          }
          return;
        }

        const response = await fetch(`/api/places/posts-status/${meta.postsTaskId}`, {
          signal: controller.signal
        });
        const data = await response.json();
        if (data.isComplete && !controller.signal.aborted) {
          fetchData(new AbortController(), { forceRefresh: true });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Polling failed:', err);
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    const intervalId = setInterval(poll, POLLING_INTERVAL);

    return () => {
      clearInterval(intervalId);
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
