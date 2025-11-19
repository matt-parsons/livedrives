'use client';

import { useEffect, useRef, useState } from 'react';

let googleMapsLoaderPromise = null;

const RANK_GRADIENT = ['#1a7431', '#2d8a3c', '#4c9f4c', '#6db460', '#94c978', '#c8dd96', '#f4e6a4', '#f8c77e'];
const RANK_ELEVATED = '#f5a623';
const RANK_LONGTAIL = '#f07b3f';
const RANK_MAX = '#718f94';
const RANK_UNKNOWN = '#4b5563';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCoordinate(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(5);
}

function formatTimestamp(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function buildInfoWindowContent(point, businessName) {
  const rankLabel = String(point.rankLabel ?? '?');
  const capturedLabel = formatTimestamp(point.timestampIso);
  const coordLabel = `${formatCoordinate(point.lat)}, ${formatCoordinate(point.lng)}`;
  const runDateLabel = point.runDate
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(point.runDate))
    : null;
  const runIdLabel = point.runId != null ? `Run #${escapeHtml(point.runId)}` : null;
  const keywordLabel = point.keyword ? escapeHtml(point.keyword) : null;
  const businessLabel = businessName ? escapeHtml(businessName) : null;

  const rows = [
    `<div style="font-weight:600;font-size:14px;margin-bottom:4px;">Rank ${escapeHtml(rankLabel)}</div>`,
    keywordLabel ? `<div style="margin:2px 0;">Keyword: <strong>${keywordLabel}</strong></div>` : '',
    businessLabel ? `<div style="margin:2px 0;">Business: <strong>${businessLabel}</strong></div>` : '',
    `<div style="margin:2px 0;">Captured: <strong>${escapeHtml(capturedLabel)}</strong></div>`,
    runDateLabel ? `<div style="margin:2px 0;">Session date: <strong>${escapeHtml(runDateLabel)}</strong></div>` : '',
    runIdLabel ? `<div style="margin:2px 0;">${runIdLabel}</div>` : '',
    `<div style="margin-top:6px;font-size:12px;color:#4b5563;">Coords: ${escapeHtml(coordLabel)}</div>`
  ].filter(Boolean);

  return `<div style="min-width:210px;color:#111;">${rows.join('')}</div>`;
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

function normalizeRank(rankPosition) {
  if (rankPosition === null || rankPosition === undefined) {
    return null;
  }

  if (typeof rankPosition === 'number') {
    return Number.isFinite(rankPosition) ? rankPosition : null;
  }

  const trimmed = String(rankPosition).trim();
  if (!trimmed) return null;
  if (trimmed === '?') return null;
  if (trimmed === '20+') return 21;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMarkerColor(rankPosition) {
  const rank = normalizeRank(rankPosition);

  if (rank === null) {
    return RANK_UNKNOWN;
  }

  if (rank >= 1 && rank <= 8) {
    return RANK_GRADIENT[Math.max(0, Math.min(RANK_GRADIENT.length - 1, Math.floor(rank) - 1))];
  }

  if (rank <= 12) {
    return RANK_ELEVATED;
  }

  if (rank <= 20) {
    return RANK_LONGTAIL;
  }

  return RANK_MAX;
}

function buildMarkerIcon(rankPosition) {
  const normalized = normalizeRank(rankPosition);
  const label = normalized === null
    ? '?'
    : normalized > 20
      ? '20+'
      : String(Math.round(normalized));
  const fill = getMarkerColor(normalized);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="${fill}" stroke="#ffffff" stroke-width="2" />
  <text x="50" y="57" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="300" fill="#ffffff" text-anchor="middle">${label}</text>
</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(52, 52),
    anchor: new window.google.maps.Point(26, 26)
  };
}

function fitBounds(map, mapsApi, center, points) {
  if (!points.length) {
    map.setCenter(center);
    map.setZoom(11);
    return;
  }

  const bounds = new mapsApi.LatLngBounds();
  bounds.extend(center);

  for (const point of points) {
    bounds.extend({ lat: point.lat, lng: point.lng });
  }

  map.fitBounds(bounds, 48);
}

export default function CtrMap({ apiKey, center, points, businessName }) {
  const mapRef = useRef(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let mapInstance = null;
    let markers = [];
    let infoWindow = null;

    loadGoogleMaps(apiKey)
      .then((mapsApi) => {
        if (!mapRef.current) {
          return;
        }

        mapInstance = new mapsApi.Map(mapRef.current, {
          center,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });

        fitBounds(mapInstance, mapsApi, center, points);

        infoWindow = new mapsApi.InfoWindow();

        markers = points.map((point) => {
          const icon = buildMarkerIcon(point.rankPosition ?? point.rankLabel);
          const marker = new mapsApi.Marker({
            position: { lat: point.lat, lng: point.lng },
            map: mapInstance,
            icon,
            title: point.rankLabel === '?'
              ? 'Rank not available'
              : `Rank ${point.rankLabel}`
          });

          marker.addListener('click', () => {
            if (!infoWindow) return;
            infoWindow.setContent(buildInfoWindowContent(point, businessName));
            infoWindow.open(mapInstance, marker);
          });

          return marker;
        });
      })
      .catch((error) => {
        setLoadError(error.message);
      });

    return () => {
      if (markers.length) {
        markers.forEach((marker) => marker.setMap(null));
      }

      if (infoWindow) {
        infoWindow.close();
        infoWindow = null;
      }

      mapInstance = null;
    };
  }, [apiKey, center, points]);

  return (
    <div className="ctr-map">
      <div ref={mapRef} className="ctr-map__canvas" aria-label="CTR session map" />
      {loadError ? <p className="ctr-map__error">{loadError}</p> : null}
      <p className="ctr-map__count">Sessions plotted: {points.length}</p>
      <style jsx>{`
        .ctr-map {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .ctr-map__canvas {
          width: 100%;
          min-height: 360px;
          border-radius: 8px;
          border: 1px solid #d9d9d9;
          overflow: hidden;
        }

        .ctr-map__error {
          color: #d9534f;
          margin-top: 0.5rem;
          font-weight: 600;
        }

        .ctr-map__count {
          color: #555;
          margin: 0;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
