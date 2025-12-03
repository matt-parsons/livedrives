'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebaseClient';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';

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

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const isSubmitting = status === 'submitting';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please provide your email address.');
      return;
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    setStatus('submitting');

    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      try {
        await sendEmailVerification(credential.user);
      } catch (verificationError) {
        console.warn('Failed to send verification email', verificationError);
      }

      const idToken = await credential.user.getIdToken();
      await exchangeSession(idToken);
      await bootstrapSession();
      await auth.signOut();

      router.push('/dashboard/get-started');
      router.refresh();
    } catch (err) {
      console.error('Registration flow failed', err);
      setError(err.message || 'Unable to complete registration right now.');
      setStatus('idle');
    }
  }

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur">
          <h1 className="text-3xl font-semibold text-foreground">Sign up - Try LocalPaintPilot for free</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Create your account with a secure password to unlock your dashboard and the guided get started flow. You&apos;ll
            receive an authentication email for verification while keeping immediate access to your workspace.
          </p>
          <div className="rounded-lg border border-border/60 bg-background/80 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">What to expect</p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Choose an email and password to create your Local Paint Pilot account.</li>
              <li>We&apos;ll send the Firebase authentication email automatically.</li>
              <li>After sign-up, you&apos;ll land in your dashboard and the /get-started flow.</li>
            </ul>
          </div>
        </section>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>Secure your workspace and start optimizing in minutes.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a strong password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">Minimum {MIN_PASSWORD_LENGTH} characters.</p>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating your account…' : 'Start free trial'}
              </Button>
            </form>
          </CardContent>

          <CardFooter>
            {error ? (
              <p
                role="alert"
                className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                We&apos;ll send verification details immediately so you can confirm ownership anytime.
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
