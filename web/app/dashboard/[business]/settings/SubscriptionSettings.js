'use client';

import { useState } from 'react';

// A simple dialog component. In a real app, you'd use a proper library like Radix or Material UI.
const ConfirmationDialog = ({ open, onClose, onConfirm, title, children }) => {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.5rem' }}>
        <h2>{title}</h2>
        <p>{children}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={onConfirm} style={{ backgroundColor: 'red', color: 'white' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
};


export default function SubscriptionSettings({ subscription }) {
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

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Subscription</h2>
        <p className="section-caption">Manage your subscription details.</p>
      </div>

      <div className="surface-card surface-card--muted">
        {subscription ? (
          <div>
            <p><strong>Plan:</strong> {subscription.subscription_plan}</p>
            <p><strong>Status:</strong> {subscription.subscription_status}</p>
            <p><strong>Renews on:</strong> {subscription.subscription_renews_at ? new Date(subscription.subscription_renews_at).toLocaleDateString() : 'N/A'}</p>
            <button onClick={() => setDialogOpen(true)} disabled={isCanceling}>
              {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
            </button>
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
