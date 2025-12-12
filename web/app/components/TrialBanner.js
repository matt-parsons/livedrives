"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

function mapTrialRow(row) {
  if (!row) {
    return null;
  }

  const organizationId = Number(row.organizationId);
  const startsAt = toDate(row.trialStartsAt);
  const endsAt = toDate(row.trialEndsAt);
  const createdAt = toDate(row.createdAt);
  const status = row.status || 'active';
  const now = new Date();
  const endsTime = endsAt ? endsAt.getTime() : null;
  const msRemaining = endsTime === null ? null : Math.max(0, endsTime - now.getTime());
  const daysRemaining = msRemaining === null ? null : Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  const isExpired = status === 'expired' || (endsTime !== null && now.getTime() > endsTime);
  const isActive = status === 'active' && !isExpired;

  return {
    organizationId,
    trialStartsAt: startsAt,
    trialEndsAt: endsAt,
    createdAt,
    status,
    isActive,
    isExpired,
    daysRemaining
  };
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }

  return new Date(time);
}

export default function TrialBanner({ organizationId }) {
  const [trialData, setTrialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTrialData() {
      try {
        const response = await fetch(`/api/organization/${organizationId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Assuming the API returns an object with `subscription` and `trial` fields
        const trialStatus = data.trial?.status;
        console.log('subscription', data);
        const rawTrial = data.trial;

        if (trialStatus === 'active' && rawTrial) {
            setTrialData(mapTrialRow(rawTrial));
        } else {
            setTrialData(null); // Not trialing or no trial data
        }
      } catch (e) {
        console.error("Failed to fetch trial data:", e);
        setError(e);
      } finally {
        setLoading(false);
      }
    }

    if (organizationId) {
      fetchTrialData();
    }
  }, [organizationId]);

  if (loading) {
    return null; // Or a loading spinner if preferred
  }

  if (error || !trialData || !trialData.isActive || trialData.daysRemaining <= 0) {
    return null; // Don't show banner if there's an error, no trial, or trial expired
  }

  return (
    <div className="trial-banner border-l-4 py-2 border-blue-500 text-blue-700 z-50 flex justify-center items-center text-sm w-full gap-4" role="alert">
      <div>
        <p><span className="font-bold">Trial Period Active</span>. You have {trialData.daysRemaining} days left in your Trial - Upgrade now to continue accessing all features.</p>
      </div>
      <Link href="/dashboard/upgrade" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded">
        Upgrade Now
      </Link>
    </div>
  );
}
