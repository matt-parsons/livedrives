'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

function formatDate(isoString) {
  if (!isoString) {
    return '—';
  }

  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    return isoString;
  }
}

export default function BusinessDirectoryTable({ businesses: initialBusinesses, organizationId }) {
  const [businesses, setBusinesses] = useState(initialBusinesses || []);
  const [rowStates, setRowStates] = useState({});
  const [dialogBusiness, setDialogBusiness] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const updateRowState = useCallback((businessId, updates) => {
    setRowStates((prev) => ({
      ...prev,
      [businessId]: {
        ...(prev[businessId] || {}),
        ...updates
      }
    }));
  }, []);

  const closeDialog = useCallback((nextOpen) => {
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      setDialogBusiness(null);
    }
  }, []);

  const confirmDelete = useCallback(
    async (business) => {
      if (!business) {
        return;
      }

      updateRowState(business.id, { deleteStatus: 'loading', deleteMessage: '' });

      try {
        const organizationQuery = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
        const response = await fetch(`/api/owner/businesses/${business.id}${organizationQuery}`, {
          method: 'DELETE'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to delete business.');
        }

        setBusinesses((prev) => prev.filter((entry) => entry.id !== business.id));
        updateRowState(business.id, { deleteStatus: 'success', deleteMessage: '' });
      } catch (error) {
        updateRowState(business.id, {
          deleteStatus: 'error',
          deleteMessage: error.message || 'Failed to delete business.'
        });
      } finally {
        closeDialog(false);
      }
    },
    [closeDialog, organizationId, updateRowState]
  );

  const handleDeleteClick = useCallback((business) => {
    setDialogBusiness(business);
    setDialogOpen(true);
  }, []);

  if (!businesses.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-6 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">No businesses detected</p>
        <p className="mt-2">Add a business to start generating ranking reports and geo grids.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Businesses</p>
        <p className="text-xl font-semibold text-foreground">Managed locations</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="min-w-full divide-y divide-border/70 text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                Business
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                Slug
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                Created
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 bg-card/60">
            {businesses.map((business) => {
              const state = rowStates[business.id] || {};
              const isDeleting = state.deleteStatus === 'loading';

              return (
                <tr key={business.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{business.businessName}</div>
                    <div className="text-xs text-muted-foreground">ID #{business.id}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{business.businessSlug || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(business.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => handleDeleteClick(business)}>
                        {isDeleting ? 'Deleting…' : 'Delete business'}
                      </Button>
                      {state.deleteStatus === 'error' ? (
                        <p className="text-xs text-destructive">{state.deleteMessage}</p>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {dialogBusiness?.businessName}?</DialogTitle>
            <DialogDescription>
              This will permanently remove the business, all run history, geo grids, GBP authorizations, reviews, and any
              scheduled reports. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete(dialogBusiness)}>
              Delete business
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
