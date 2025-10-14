'use client';

import { useEffect, useRef, useState } from 'react';

let googleMapsLoaderPromise = null;

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

function buildMarkerIcon(rankPosition) {
  const safeRank = rankPosition === null || rankPosition === undefined
    ? null
    : Number(rankPosition);

  const label = safeRank === null
    ? '?'
    : safeRank > 20
      ? '20+'
      : String(safeRank);
  let fill = '#6c757d';

  if (safeRank !== null) {
    if (safeRank <= 3) {
      fill = '#2ba84a';
    } else if (safeRank <= 10) {
      fill = '#f1c40f';
    } else {
      fill = '#e67e22';
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <circle cx="24" cy="24" r="18" fill="${fill}" filter="url(#shadow)" />
  <text x="24" y="28" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="600" fill="#ffffff" text-anchor="middle">${label}</text>
</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(36, 36),
    anchor: new window.google.maps.Point(18, 18)
  };
}

function fitBoundsToPoints(map, mapsApi, center, points) {
  if (!points.length) {
    map.setCenter(center);
    map.setZoom(12);
    return;
  }

  const bounds = new mapsApi.LatLngBounds();
  bounds.extend(center);

  points.forEach((point) => {
    bounds.extend({ lat: point.lat, lng: point.lng });
  });

  map.fitBounds(bounds, 64);
}

export default function GeoGridMap({ apiKey, center, points, radiusMiles, spacingMiles, gridRows, gridCols }) {
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
      <aside className="geo-grid-map__legend">
        <h3>Legend</h3>
        <ul>
          <li><span className="legend-swatch legend-swatch--strong" /> Rank 1-3</li>
          <li><span className="legend-swatch legend-swatch--medium" /> Rank 4-10</li>
          <li><span className="legend-swatch legend-swatch--weak" /> Rank 11+</li>
          <li><span className="legend-swatch legend-swatch--unknown" /> No rank</li>
        </ul>
        <div className="geo-grid-map__meta">
          <p>Grid: {gridRows ?? '—'} x {gridCols ?? '—'}</p>
          <p>Radius: {radiusMiles !== null && radiusMiles !== undefined ? `${Number(radiusMiles).toFixed(2)} mi` : '—'}</p>
          <p>Spacing: {spacingMiles !== null && spacingMiles !== undefined ? `${Number(spacingMiles).toFixed(2)} mi` : '—'}</p>
        </div>
        {loadError ? <p className="geo-grid-map__error">{loadError}</p> : null}
      </aside>
      <style jsx>{`
        .geo-grid-map {
          display: grid;
          gap: 1rem;
          grid-template-columns: minmax(0, 1fr) 220px;
        }

        .geo-grid-map__canvas {
          width: 100%;
          min-height: 420px;
          border-radius: 8px;
          border: 1px solid #d9d9d9;
          overflow: hidden;
        }

        .geo-grid-map__legend {
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          padding: 1rem;
          background-color: #fafafa;
        }

        .geo-grid-map__legend ul {
          list-style: none;
          padding: 0;
          margin: 0 0 1rem 0;
        }

        .geo-grid-map__legend li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          margin-bottom: 0.4rem;
        }

        .legend-swatch {
          display: inline-block;
          width: 14px;
          height: 14px;
          border-radius: 7px;
        }

        .legend-swatch--strong {
          background-color: #2ba84a;
        }

        .legend-swatch--medium {
          background-color: #f1c40f;
        }

        .legend-swatch--weak {
          background-color: #e67e22;
        }

        .legend-swatch--unknown {
          background-color: #6c757d;
        }

        .geo-grid-map__meta {
          font-size: 0.9rem;
          color: #444;
        }

        .geo-grid-map__meta p {
          margin: 0.3rem 0;
        }

        .geo-grid-map__error {
          color: #d9534f;
          font-size: 0.9rem;
          margin-top: 0.5rem;
        }

        @media (max-width: 900px) {
          .geo-grid-map {
            grid-template-columns: minmax(0, 1fr);
          }

          .geo-grid-map__legend {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
}
