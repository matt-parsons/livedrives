'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebaseClient';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import Link from 'next/link';

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
  const isRedirecting = status === 'redirecting';
  const isBusy = isSubmitting || isRedirecting;

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

  const buildGoogleLoginUrl = () => {
    const baseUrl = process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI
      ? new URL('/api/auth/google/login', process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI)
      : new URL('/api/auth/google/login', window.location.origin);

    baseUrl.searchParams.set('redirect', '/dashboard/get-started');

    return baseUrl.toString();
  };

  const handleGoogle = () => {
    setError('');
    setStatus('redirecting');

    window.location.href = buildGoogleLoginUrl();
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur">
          <h1 className="text-3xl font-semibold text-foreground">Sign up<br />Try LocalPaintPilot for free</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
Let's get you started<br></br>
Securely create your account in seconds.
          </p>
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
                  disabled={isBusy}
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
                  disabled={isBusy}
                />
                <p className="text-xs text-muted-foreground">Minimum {MIN_PASSWORD_LENGTH} characters.</p>
              </div>

              <Button type="submit" className="w-full" disabled={isBusy}>
                {isSubmitting ? 'Creating your account…' : 'Start free trial'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="h-px flex-1 bg-border" aria-hidden />
              <span>or</span>
              <div className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleGoogle}
              disabled={isBusy}
            >
              {isRedirecting ? 'Preparing Google sign-up…' : 'Continue with Google'}
            </Button>

            {error ? (
              <p
                role="alert"
                className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Already have an account? <Link href="/signin">Log in</Link>
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
