'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function UserAccountSettings({ initialEmail = '' }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [emailStatus, setEmailStatus] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  const [passwordState, setPasswordState] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [resetStatus, setResetStatus] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSending, setResetSending] = useState(false);

  const [deleteError, setDeleteError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setEmailStatus('');
    setEmailError('');
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setEmailSaving(true);

    try {
      const response = await fetch('/api/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update email.');
      }

      setEmail(trimmedEmail);
      setEmailStatus('Email updated and synced with Firebase.');
    } catch (error) {
      setEmailError(error.message || 'Unable to update email.');
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordStatus('');
    setPasswordError('');

    const { newPassword, confirmPassword } = passwordState;
    const trimmedPassword = (newPassword || '').trim();
    const trimmedConfirm = (confirmPassword || '').trim();

    if (!trimmedPassword || trimmedPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setPasswordSaving(true);

    try {
      const response = await fetch('/api/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmedPassword })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setPasswordState({ newPassword: '', confirmPassword: '' });
      setPasswordStatus('Password updated in Firebase.');
    } catch (error) {
      setPasswordError(error.message || 'Unable to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSendReset = async () => {
    setResetStatus('');
    setResetError('');

    if (!email) {
      setResetError('Add an email address first.');
      return;
    }

    setResetSending(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetStatus('Password reset email sent. Check your inbox.');
    } catch (error) {
      setResetError(error.message || 'Unable to send reset email.');
    } finally {
      setResetSending(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');

    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account cancellation.');
      return;
    }

    setDeleteSaving(true);

    try {
      const response = await fetch('/api/auth/account', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel account.');
      }

      setDeleteConfirm('');
      await auth.signOut();
      router.push('/signin');
      router.refresh();
    } catch (error) {
      setDeleteError(error.message || 'Unable to cancel account.');
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <Dialog>
      <div className="grid gap-4 flex-row justify-between md:flex md:items-center">
        <p className="text-sm text-muted-foreground">Review and update your sign-in email, password, or account status.</p>
        <div>
        <DialogTrigger asChild>
          <Button variant="secondary" type="button">Manage your account details</Button>
        </DialogTrigger>
        </div>
      </div>

      <DialogContent className="max-w-3xl">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">Account details</p>
          <p className="text-sm text-muted-foreground">These settings stay synced with Firebase authentication.</p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid gap-8">
            <form className="grid gap-4" onSubmit={handleEmailSubmit}>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  disabled={emailSaving}
                />
                <p className="text-xs text-muted-foreground">Change your login email.</p>
              </div>

              {emailError ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {emailError}
                </p>
              ) : null}
              {emailStatus ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                  {emailStatus}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={emailSaving}>
                  {emailSaving ? 'Saving…' : 'Update email'}
                </Button>
              </div>
            </form>

            <form className="grid gap-4" onSubmit={handlePasswordSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwordState.newPassword}
                    onChange={(event) => setPasswordState((prev) => ({ ...prev, newPassword: event.target.value }))}
                    autoComplete="new-password"
                    disabled={passwordSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwordState.confirmPassword}
                    onChange={(event) => setPasswordState((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    autoComplete="new-password"
                    disabled={passwordSaving}
                  />
                </div>
              </div>

              {passwordError ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {passwordError}
                </p>
              ) : null}
              {passwordStatus ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                  {passwordStatus}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-between gap-3">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Use a strong password to keep your account secure.</p>
                </div>
                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? 'Saving…' : 'Update password'}
                </Button>
              </div>
            </form>

            <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/40 p-4">
              <div>
                <p className="font-semibold text-foreground">Send password reset email</p>
                <p className="text-sm text-muted-foreground">We will email a reset link using the address above.</p>
              </div>
              {resetError ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {resetError}
                </p>
              ) : null}
              {resetStatus ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                  {resetStatus}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={handleSendReset} disabled={resetSending}>
                  {resetSending ? 'Sending…' : 'Send reset link'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div>
                <p className="font-semibold text-destructive">Cancel account</p>
                <p className="text-sm text-muted-foreground">
                  Deleting your account removes access and removes your user record. This action cannot be undone.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  disabled={deleteSaving}
                  placeholder="DELETE"
                />
              </div>
              {deleteError ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {deleteError}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button type="button" variant="destructive" onClick={handleDeleteAccount} disabled={deleteSaving}>
                  {deleteSaving ? 'Cancelling…' : 'Delete account'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
