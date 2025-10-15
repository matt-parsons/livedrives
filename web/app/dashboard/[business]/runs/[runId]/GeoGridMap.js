'use client';

import { useEffect, useRef, useState } from 'react';

let googleMapsLoaderPromise = null;

const RANK_GRADIENT = ['#1a7431', '#2d8a3c', '#4c9f4c', '#6db460', '#94c978', '#c8dd96', '#f4e6a4', '#f8c77e'];
const RANK_ELEVATED = '#f5a623';
const RANK_LONGTAIL = '#f07b3f';
const RANK_MAX = '#718f94';
const RANK_UNKNOWN = '#4b5563';

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

function buildMarkerIcon(rankPosition) {
  const safeRank = rankPosition === null || rankPosition === undefined
    ? null
    : Number(rankPosition);

  const label = safeRank === null
    ? '?'
    : safeRank > 20
      ? '20+'
      : String(safeRank);
  const fill = getMarkerColor(rankPosition);

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

  map.fitBounds(bounds, 80);
}

export default function GeoGridMap({ apiKey, center, points }) {
  const mapRef = useRef(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let mapInstance = null;
    let markers = [];

    loadGoogleMaps(apiKey)
      .then((mapsApi) => {
        if (!mapRef.current) {
          return;
        }

        mapInstance = new mapsApi.Map(mapRef.current, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });

        fitBoundsToPoints(mapInstance, mapsApi, center, points);

        markers = points.map((point) => new mapsApi.Marker({
          position: { lat: point.lat, lng: point.lng },
          map: mapInstance,
          icon: buildMarkerIcon(point.rankPosition),
          title: point.rankPosition === null
            ? 'Rank not available'
            : `Rank ${point.rankLabel}`,
          label: undefined
        }));
      })
      .catch((error) => {
        setLoadError(error.message);
      });

    return () => {
      if (markers.length) {
        markers.forEach((marker) => marker.setMap(null));
      }

      if (mapInstance) {
        mapInstance = null;
      }
    };
  }, [apiKey, center, points]);

  return (
    <div className="geo-grid-map">
      <div ref={mapRef} className="geo-grid-map__canvas" aria-label="Geo grid map" />
      {loadError ? <p className="geo-grid-map__error">{loadError}</p> : null}
      <style jsx>{`
        .geo-grid-map {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .geo-grid-map__canvas {
          width: 100%;
          min-height: clamp(360px, 60vw, 520px);
          aspect-ratio: 1 / 1;
          border-radius: var(--radius-md);
          border: 1px solid rgba(40, 40, 40, 0.08);
          overflow: hidden;
          box-shadow: 0 28px 54px rgba(40, 40, 40, 0.16);
          background: rgba(255, 255, 255, 0.9);
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
