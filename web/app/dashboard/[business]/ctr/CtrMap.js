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

function buildMarkerIcon(rankLabel) {
  let fill = '#6c757d';

  if (rankLabel !== '?' && rankLabel !== '20+') {
    const numericRank = Number(rankLabel);

    if (!Number.isNaN(numericRank)) {
      if (numericRank <= 3) {
        fill = '#2ba84a';
      } else if (numericRank <= 10) {
        fill = '#f1c40f';
      } else {
        fill = '#e67e22';
      }
    }
  }

  if (rankLabel === '20+') {
    fill = '#e67e22';
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <circle cx="22" cy="22" r="16" fill="${fill}" filter="url(#shadow)" />
  <text x="22" y="27" font-size="16" font-family="Arial, Helvetica, sans-serif" font-weight="600" fill="#ffffff" text-anchor="middle">${rankLabel}</text>
</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 16)
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

export default function CtrMap({ apiKey, center, points }) {
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
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });

        fitBounds(mapInstance, mapsApi, center, points);

        markers = points.map((point) => new mapsApi.Marker({
          position: { lat: point.lat, lng: point.lng },
          map: mapInstance,
          icon: buildMarkerIcon(point.rankLabel),
          title: point.rankLabel === '?'
            ? 'Rank not available'
            : `Rank ${point.rankLabel}`
        }));
      })
      .catch((error) => {
        setLoadError(error.message);
      });

    return () => {
      if (markers.length) {
        markers.forEach((marker) => marker.setMap(null));
      }

      mapInstance = null;
    };
  }, [apiKey, center, points]);

  return (
    <div className="ctr-map">
      <div ref={mapRef} className="ctr-map__canvas" aria-label="CTR session map" />
      <aside className="ctr-map__legend">
        <h3>Legend</h3>
        <ul>
          <li><span className="legend-swatch legend-swatch--strong" /> Rank 1-3</li>
          <li><span className="legend-swatch legend-swatch--medium" /> Rank 4-10</li>
          <li><span className="legend-swatch legend-swatch--weak" /> Rank 11-20+</li>
          <li><span className="legend-swatch legend-swatch--unknown" /> No rank</li>
        </ul>
        {loadError ? <p className="ctr-map__error">{loadError}</p> : null}
        <p className="ctr-map__count">Sessions plotted: {points.length}</p>
      </aside>
      <style jsx>{`
        .ctr-map {
          display: grid;
          gap: 1rem;
          grid-template-columns: minmax(0, 1fr) 220px;
        }

        .ctr-map__canvas {
          width: 100%;
          min-height: 360px;
          border-radius: 8px;
          border: 1px solid #d9d9d9;
          overflow: hidden;
        }

        .ctr-map__legend {
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          padding: 1rem;
          background-color: #fafafa;
          font-size: 0.9rem;
        }

        .ctr-map__legend ul {
          list-style: none;
          padding: 0;
          margin: 0 0 1rem 0;
        }

        .ctr-map__legend li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }

        .legend-swatch {
          display: inline-block;
          width: 14px;
          height: 14px;
          border-radius: 7px;
        }

        .legend-swatch--strong { background-color: #2ba84a; }
        .legend-swatch--medium { background-color: #f1c40f; }
        .legend-swatch--weak { background-color: #e67e22; }
        .legend-swatch--unknown { background-color: #6c757d; }

        .ctr-map__error {
          color: #d9534f;
          margin-top: 0.5rem;
        }

        .ctr-map__count {
          color: #555;
          margin-top: 0.6rem;
        }

        @media (max-width: 900px) {
          .ctr-map {
            grid-template-columns: minmax(0, 1fr);
          }

          .ctr-map__legend {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
}
