'use client';

import { useState } from 'react';
import Link from 'next/link';

// A simple dialog component. In a real app, you'd use a proper library like Radix or Material UI.
const ConfirmationDialog = ({ open, onClose, onConfirm, title, children }) => {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.5rem' }}>
        <h2>{title}</h2>
        <p>{children}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-background bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 h-10 px-4 py-2" onClick={onClose}>Cancel</button>
          <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-background bg-popover text-primary-foreground shadow-sm hover:bg-primary/90 h-10 px-4 py-2" onClick={onConfirm} style={{ backgroundColor: 'red', color: 'white' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
};

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


export default function SubscriptionSettings({ subscription, trial }) {
  const [isCanceling, setIsCanceling] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCancel = async () => {
    setDialogOpen(false);
    setIsCanceling(true);
    
    try {
      const response = await fetch('/api/stripe/subscription', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      // reload the page to reflect the changes
      window.location.reload();

    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsCanceling(false);
    }
  };

  const trialData = mapTrialRow(trial);
  console.log('subscription', subscription);
  const showSubscription = subscription.subscription_plan != null;
  const showTrial = subscription.subscription_plan === null && trialData && trialData.isActive;

  return (
    <section className="section">

      <div className="surface-card surface-card--muted">
        <div className="section-header mb-4">
          <h2 className="section-title">Subscription</h2>
        </div>
        {showSubscription ? (
          <div className='gap-4 flex flex-col items-start'>
            <p><strong>Status:</strong> {subscription.subscription_status}</p>
            <p><strong>Renews on:</strong> {subscription.subscription_renews_at ? new Date(subscription.subscription_renews_at).toLocaleDateString() : 'N/A'}</p>
            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-background bg-popover text-primary-foreground shadow-sm hover:bg-primary/90 h-10 px-4 py-2" onClick={() => setDialogOpen(true)} disabled={isCanceling}>
              {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
            </button>
          </div>
        ) : showTrial ? (
          <div className="gap-2 flex flex-row items-center justify-between">
            <div>
            <p><strong>Plan:</strong> Trial Period</p>
            <p><strong>Status:</strong> Active</p>
            {trialData.trialEndsAt && (
              <p><strong>Expires on:</strong> {trialData.trialEndsAt.toLocaleDateString()} ({trialData.daysRemaining} days left)</p>
            )}
            </div>
            <Link href="/dashboard/upgrade" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-background bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 h-10 px-4 py-2">
              Upgrade Now
            </Link>
          </div>
        ) : (
          <p>No active subscription found.</p>
        )}
      </div>

      <ConfirmationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleCancel}
        title="Are you sure you want to cancel?"
      >
        If you cancel your subscription, your business information and ranking reports will be permanently deleted. This action cannot be undone.
      </ConfirmationDialog>
    </section>
  );
}
