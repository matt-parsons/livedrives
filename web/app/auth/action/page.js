'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

async function exchangeSession(idToken) {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to start your session.');
  }
}

async function bootstrapSession() {
  const response = await fetch('/api/auth/bootstrap', {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to finish bootstrapping your account.');
  }

  return response.json();
}

const MIN_PASSWORD_LENGTH = 8;

function normalizeParam(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export default function AuthActionPage({ searchParams }) {
  const router = useRouter();
  const mode = normalizeParam(searchParams?.mode);
  const oobCode = normalizeParam(searchParams?.oobCode);
  const continueUrl = normalizeParam(searchParams?.continueUrl);
  const [screen, setScreen] = useState('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitStatus, setSubmitStatus] = useState('idle');

  const safeRedirectPath = useMemo(() => {
    if (continueUrl.startsWith('/')) {
      return continueUrl || '/dashboard';
    }

    return '/dashboard';
  }, [continueUrl]);

  useEffect(() => {
    if (!mode || !oobCode) {
      setError('This link is missing some information. Please request a fresh email and try again.');
      setScreen('error');
      return;
    }

    if (mode === 'verifyEmail') {
      setScreen('verifying');
      applyActionCode(auth, oobCode)
        .then(() => {
          setScreen('verified');
        })
        .catch((err) => {
          console.error('Failed to verify email', err);
          setError('We could not verify your email. The link may be expired or already used.');
          setScreen('error');
        });
      return;
    }

    if (mode === 'resetPassword') {
      setScreen('verifying');
      verifyPasswordResetCode(auth, oobCode)
        .then((resetEmail) => {
          setEmail(resetEmail);
          setScreen('reset');
        })
        .catch((err) => {
          console.error('Invalid password reset link', err);
          setError('This password link is invalid or has expired. Request a new password email to continue.');
          setScreen('error');
        });
      return;
    }

    setError('This Firebase action is not supported.');
    setScreen('error');
  }, [mode, oobCode]);

  const isSubmitting = submitStatus === 'submitting';

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setSubmitError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmitError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setSubmitStatus('submitting');

    try {
      await confirmPasswordReset(auth, oobCode, password);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();
      await exchangeSession(idToken);
      await bootstrapSession();
      await auth.signOut();
      router.push(safeRedirectPath);
      router.refresh();
    } catch (err) {
      console.error('Failed to complete password reset', err);
      setSubmitError(err?.message || 'Unable to update your password.');
      setSubmitStatus('idle');
    }
  }

  const isLoading = screen === 'loading' || screen === 'verifying';

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-xl">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>
              {screen === 'verified'
                ? 'Email verified'
                : screen === 'reset'
                  ? 'Create your password'
                  : 'Checking your link'}
            </CardTitle>
            <CardDescription>
              {screen === 'verified'
                ? 'Your email address is confirmed. You can sign in with your new password to access your dashboard.'
                : screen === 'reset'
                  ? 'Choose a password to secure your Local Paint Pilot account. You will be logged in automatically once complete.'
                  : 'Please wait while we confirm the details from your email link.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Processing your request…</p>
            ) : null}

            {screen === 'error' ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {screen === 'verified' ? (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>Your email address is verified. Next, set a password using the secure link we sent to your inbox.</p>
                <p>If you have already created a password, you can sign in below.</p>
              </div>
            ) : null}

            {screen === 'reset' ? (
              <form className="space-y-4" onSubmit={handlePasswordSubmit} noValidate>
                <div>
                  <Label htmlFor="email">Account</Label>
                  <Input id="email" type="email" value={email} disabled className="mt-1" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Securing your account…' : 'Save password and continue'}
                </Button>
              </form>
            ) : null}
          </CardContent>

          {screen === 'reset' ? (
            <CardFooter>
              {submitError ? (
                <p className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Passwords must contain at least {MIN_PASSWORD_LENGTH} characters. You will be redirected to your dashboard once saved.
                </p>
              )}
            </CardFooter>
          ) : null}

          {screen === 'verified' ? (
            <CardFooter className="flex flex-col gap-3">
              <Button type="button" className="w-full" onClick={() => router.push('/signin')}>
                Go to sign in
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Need to create a password? Re-open the password email we sent or request a new one from support.
              </p>
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
