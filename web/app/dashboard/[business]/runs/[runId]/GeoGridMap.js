'use client';

import { useEffect, useRef, useState } from 'react';

let googleMapsLoaderPromise = null;

const RANK_GRADIENT = ['#1a7431', '#2d8a3c', '#4c9f4c', '#6db460', '#94c978', '#c8dd96', '#f4e6a4', '#f8c77e'];
const RANK_ELEVATED = '#f5a623';
const RANK_LONGTAIL = '#f07b3f';
const RANK_MAX = '#718f94';
const RANK_UNKNOWN = '#4b5563';

function toNumeric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=maps`;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps SDK failed to load.'));
      }
    });
    script.addEventListener('error', () => {
      reject(new Error('Google Maps SDK failed to load.'));
    });

    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

function getMarkerColor(rankPosition) {
  if (rankPosition === null || rankPosition === undefined) {
    return RANK_UNKNOWN;
  }

  const rank = Number(rankPosition);

  if (!Number.isFinite(rank)) {
    return RANK_UNKNOWN;
  }

  if (rank >= 1 && rank <= 8) {
    return RANK_GRADIENT[Math.max(0, Math.min(RANK_GRADIENT.length - 1, rank - 1))];
  }

  if (rank <= 12) {
    return RANK_ELEVATED;
  }

  if (rank <= 20) {
    return RANK_LONGTAIL;
  }

  return RANK_MAX;
}

function buildMarkerIcon(rankPosition, isSelected = false, unknownRankVariant = 'unknown') {
  const safeRank = rankPosition === null || rankPosition === undefined
    ? null
    : Number(rankPosition);

  const isLoadingRank = safeRank === null && unknownRankVariant === 'loading';
  const label = safeRank === null
    ? (isLoadingRank ? '' : '?')
    : safeRank > 20
      ? '20+'
      : String(safeRank);
  const fill = getMarkerColor(rankPosition);
  const strokeColor = isSelected ? '#111827' : '#ffffff';
  const strokeWidth = isSelected ? 1 : 2;
  const radius = isSelected ? 44 : 40;
  const size = isSelected ? 60 : 52;
  const anchor = size / 2;

  const loaderMarkup = isLoadingRank
    ? `
  <g transform="translate(50 50)">
    <circle r="18" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="6" />
    <path d="M0 -18 a18 18 0 1 1 -0.1 0" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1s" repeatCount="indefinite" />
    </path>
  </g>`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="${radius}" fill="${fill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
  ${loaderMarkup}
  ${label ? `<text x="50" y="57" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="300" fill="#ffffff" text-anchor="middle">${label}</text>` : ''}
</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(anchor, anchor)
  };
}

function fitBoundsToPoints(map, mapsApi, center, points) {
  if (!points.length) {
    map.setCenter(center);
    map.setZoom(13);
    return;
  }

  const bounds = new mapsApi.LatLngBounds();
  bounds.extend(center);

  points.forEach((point) => {
    bounds.extend({ lat: point.lat, lng: point.lng });
  });

  map.fitBounds(bounds, 40);
}

export default function GeoGridMap({
  apiKey,
  center,
  points,
  selectedPointId = null,
  onPointSelect,
  interactive = true,
  minHeight = 'clamp(360px, 60vw, 520px)',
  unknownRankVariant = 'unknown'
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const selectHandlerRef = useRef(onPointSelect);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    selectHandlerRef.current = onPointSelect;
  }, [onPointSelect]);

  useEffect(() => {
    let mapInstance = null;
    let markers = [];
    let cancelled = false;

    setLoadError(null);

    loadGoogleMaps(apiKey)
      .then((mapsApi) => {
        if (cancelled || !mapRef.current) {
          return;
        }

        mapInstance = new mapsApi.Map(mapRef.current, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: interactive ? 'auto' : 'none',
          draggable: interactive,
          keyboardShortcuts: interactive,
          scrollwheel: interactive,
          zoomControl: interactive,
          clickableIcons: interactive,
          disableDoubleClickZoom: !interactive
        });

        mapInstanceRef.current = mapInstance;

        fitBoundsToPoints(mapInstance, mapsApi, center, points);

        markers = points.map((point) => {
          const marker = new mapsApi.Marker({
            position: { lat: point.lat, lng: point.lng },
            map: mapInstance,
            icon: buildMarkerIcon(
              point.rankPosition,
              toNumeric(point.id) === toNumeric(selectedPointId),
              unknownRankVariant
            ),
            title: point.rankPosition === null
              ? 'Rank not available'
              : `Rank ${point.rankLabel}`,
            label: undefined
          });

          marker.__pointId = point.id;
          marker.__rankPosition = point.rankPosition;

          if (interactive) {
            marker.addListener('click', () => {
              if (typeof selectHandlerRef.current === 'function') {
                selectHandlerRef.current(point.id);
              }
            });
          }

          return marker;
        });

        markersRef.current = markers;

        if (markers.length) {
          const normalizedSelected = toNumeric(selectedPointId);
          let activeMarker = null;

          markers.forEach((marker) => {
            const markerId = toNumeric(marker.__pointId);
            const isActive = normalizedSelected !== null && markerId === normalizedSelected;
            marker.setIcon(buildMarkerIcon(marker.__rankPosition, isActive, unknownRankVariant));
            marker.setZIndex(isActive ? 1000 : undefined);

            if (isActive) {
              activeMarker = marker;
            }
          });

          // Keep selected marker visually distinct without panning the map.
          if (activeMarker) {
            activeMarker.setZIndex(1000);
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error.message);
        }
      });

    return () => {
      cancelled = true;

      if (markers.length) {
        markers.forEach((marker) => marker.setMap(null));
      }

      markersRef.current = [];

      if (mapInstance) {
        mapInstance = null;
      }

      mapInstanceRef.current = null;
    };
  }, [apiKey, center, points, interactive, selectedPointId, unknownRankVariant]);

  useEffect(() => {
    if (!markersRef.current.length) {
      return;
    }

    const normalizedSelected = toNumeric(selectedPointId);
    let activeMarker = null;

    markersRef.current.forEach((marker) => {
      const markerId = toNumeric(marker.__pointId);
      const isActive = normalizedSelected !== null && markerId === normalizedSelected;
      marker.setIcon(buildMarkerIcon(marker.__rankPosition, isActive, unknownRankVariant));
      marker.setZIndex(isActive ? 1000 : undefined);

      if (isActive) {
        activeMarker = marker;
      }
    });

    // Maintain marker emphasis without shifting the viewport when the selection changes.
    if (activeMarker) {
      activeMarker.setZIndex(1000);
    }
  }, [selectedPointId, unknownRankVariant]);

  return (
    <div className="geo-grid-map">
      <div
        ref={mapRef}
        className="geo-grid-map__canvas"
        aria-label="Local Ranking map"
        data-interactive={interactive ? 'true' : 'false'}
        style={{ '--geo-grid-map-min-height': minHeight }}
      />
      {loadError ? <p className="geo-grid-map__error">{loadError}</p> : null}
      <style jsx>{`
        .geo-grid-map {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
        }

        .geo-grid-map__canvas {
          width: 100%;
          min-height: var(--geo-grid-map-min-height, clamp(360px, 60vw, 520px));
          aspect-ratio: 1 / 1;
          border-radius: var(--radius-md);
          border: 1px solid rgba(40, 40, 40, 0.08);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.9);
          max-width: 800px;
        }

        .geo-grid-map__canvas[data-interactive='false'] {
          pointer-events: none;
        }

        .geo-grid-map__error {
          color: var(--color-primary);
          font-size: 0.85rem;
          font-weight: 600;
          background: rgba(233, 61, 35, 0.12);
          border-radius: var(--radius-sm);
          padding: 12px 16px;
          border: 1px solid rgba(233, 61, 35, 0.26);
        }

        @media (max-width: 1024px) {
          .geo-grid-map__canvas {
            min-height: clamp(320px, 70vw, 520px);
          }
        }
      `}</style>
    </div>
  );
}
