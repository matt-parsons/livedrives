'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

async function bootstrapSession() {
  const res = await fetch('/api/auth/bootstrap', {
    method: 'POST',
    credentials: 'include'
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to bootstrap session');
  }

  return res.json();
}

async function exchangeSession(idToken) {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to establish session');
  }
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailPassword = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();
      await exchangeSession(idToken);
      await bootstrapSession();
      await auth.signOut();
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);

    try {
      const redirect = encodeURIComponent('/dashboard');
      window.location.assign(`/api/auth/google?redirect=${redirect}`);
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 lg:grid lg:grid-cols-2 lg:items-start">
        <section className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur">
          <h1 className="text-3xl font-semibold text-foreground">See where you rank. <br />Fix what matters. <br />Win more local jobs.</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Your dashboard gives you clear insights, keyword data, and real-world signals to help you climb the map pack
          </p>
        </section>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to orchestrate your Livedrives operations.</CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleEmailPassword}>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={loading}
                  placeholder="you@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing you in…' : 'Sign in securely'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="h-px flex-1 bg-border" aria-hidden />
              <span>or</span>
              <div className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <Button type="button" variant="secondary" className="w-full" onClick={handleGoogle} disabled={loading}>
              {loading ? 'Preparing Google sign-in…' : 'Continue with Google'}
            </Button>

            {error ? (
              <p
                className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ):( null )}
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account? <Link href="/register">Sign up</Link>
              </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
