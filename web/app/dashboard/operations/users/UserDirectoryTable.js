'use client';

import { useCallback, useMemo, useState } from 'react';
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

function roleLabel(role) {
  if (!role) {
    return 'Member';
  }

  const normalized = role.toLowerCase();
  if (normalized === 'owner') {
    return 'Owner';
  }
  if (normalized === 'admin') {
    return 'Admin';
  }
  return 'Member';
}

export default function UserDirectoryTable({ members: initialMembers, organizationName }) {
  const [members, setMembers] = useState(initialMembers);
  const [rowStates, setRowStates] = useState({});
  const [dialogUser, setDialogUser] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalOwners = useMemo(() => members.filter((member) => member.role === 'owner').length, [members]);

  const updateRowState = useCallback((userId, updates) => {
    setRowStates((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        ...updates
      }
    }));
  }, []);

  const handleResetPassword = useCallback(
    async (userId) => {
      updateRowState(userId, { resetStatus: 'loading', resetMessage: '', resetLink: '' });

      try {
        const response = await fetch(`/api/owner/users/${userId}/reset-password`, {
          method: 'POST'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to send password reset instructions.');
        }

        updateRowState(userId, {
          resetStatus: 'success',
          resetMessage: `Password reset link generated for ${payload.email || 'this user'}. Share the link below.`,
          resetLink: payload.resetLink || ''
        });
      } catch (error) {
        updateRowState(userId, {
          resetStatus: 'error',
          resetMessage: error.message || 'Failed to trigger password reset.'
        });
      }
    },
    [updateRowState]
  );

  const closeDialog = useCallback((nextOpen) => {
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      setDialogUser(null);
    }
  }, []);

  const confirmDelete = useCallback(
    async (user) => {
      if (!user) {
        return;
      }

      updateRowState(user.id, { deleteStatus: 'loading', deleteMessage: '' });

      try {
        const response = await fetch(`/api/owner/users/${user.id}`, {
          method: 'DELETE'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to delete user.');
        }

        setMembers((prev) => prev.filter((member) => member.id !== user.id));
        updateRowState(user.id, { deleteStatus: 'success', deleteMessage: '' });

        if (payload.deletedSelf) {
          window.location.href = '/logout?redirect=/signin';
          return;
        }

        if (payload.organizationDeleted) {
          window.location.href = '/logout';
          return;
        }
      } catch (error) {
        updateRowState(user.id, {
          deleteStatus: 'error',
          deleteMessage: error.message || 'Failed to remove user.'
        });
      } finally {
        closeDialog(false);
      }
    },
    [closeDialog, updateRowState]
  );

  const handleDeleteClick = useCallback((member) => {
    setDialogUser(member);
    setDialogOpen(true);
  }, []);

  const handleCopyLink = useCallback((link) => {
    if (!link) {
      return;
    }

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
  }, []);

  if (!members.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-6 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">No members detected</p>
        <p className="mt-2">
          Invite team members from your onboarding flow or share the registration link to populate your directory.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
          <p className="text-xl font-semibold text-foreground">{organizationName}</p>
        </div>
        <p className="text-sm text-muted-foreground">{members.length} member{members.length === 1 ? '' : 's'}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="pb-3 pr-4 font-semibold">Member</th>
              <th className="pb-3 pr-4 font-semibold">Role</th>
              <th className="pb-3 pr-4 font-semibold">Joined</th>
              <th className="pb-3 pr-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {members.map((member) => {
              const state = rowStates[member.id] || {};
              const isResetting = state.resetStatus === 'loading';
              const isDeleting = state.deleteStatus === 'loading';
              const memberRoleLabel = roleLabel(member.role);

              return (
                <tr key={member.id} className="align-top">
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-foreground">{member.name || member.email}</div>
                    <div className="text-xs text-muted-foreground">{member.email}</div>
                    {member.isSelf ? (
                      <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                        You
                      </span>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-foreground">{memberRoleLabel}</div>
                    {member.isOwner && totalOwners === 1 ? (
                      <p className="text-xs text-muted-foreground">Last owner</p>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="text-sm text-foreground">{formatDate(member.joinedAt || member.createdAt)}</div>
                    <p className="text-xs text-muted-foreground">Created {formatDate(member.createdAt)}</p>
                  </td>
                  <td className="py-4 pl-4 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isResetting || isDeleting}
                        onClick={() => handleResetPassword(member.id)}
                      >
                        {isResetting ? 'Sending…' : 'Reset password'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isDeleting}
                        onClick={() => handleDeleteClick(member)}
                      >
                        {isDeleting ? 'Removing…' : 'Delete user'}
                      </Button>
                      {state.resetStatus === 'success' ? (
                        <div className="w-full rounded-md border border-dashed border-border/70 bg-background/70 p-3 text-left text-xs">
                          <p className="font-semibold text-foreground">Reset link ready</p>
                          <p className="mt-1 text-muted-foreground">{state.resetMessage}</p>
                          {state.resetLink ? (
                            <div className="mt-2 flex gap-2">
                              <code className="flex-1 truncate rounded-md bg-card/80 px-2 py-1">{state.resetLink}</code>
                              <Button size="sm" variant="secondary" onClick={() => handleCopyLink(state.resetLink)}>
                                Copy
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {state.resetStatus === 'error' ? (
                        <p className="text-xs text-destructive">{state.resetMessage}</p>
                      ) : null}
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
            <DialogTitle>Delete {dialogUser?.name || dialogUser?.email}?</DialogTitle>
            <DialogDescription>
              This action removes the member&apos;s Firebase profile and workspace access. If this is the last owner on the
              team, we&apos;ll delete every business tied to the organization as well.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete(dialogUser)}>
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
