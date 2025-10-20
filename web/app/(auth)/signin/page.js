'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Divider,
  Input
} from '@heroui/react';
import { auth } from '@/lib/firebaseClient';

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });

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
      const credential = await signInWithPopup(auth, googleProvider);
      const idToken = await credential.user.getIdToken();
      await exchangeSession(idToken);
      await bootstrapSession();
      await auth.signOut();
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <section className="space-y-6 text-foreground">
          <h1 className="text-4xl font-semibold tracking-tight">
            Operational control, beautifully streamlined.
          </h1>
          <p className="text-base text-foreground/70">
            Step into a refined workspace crafted for clarity and focus. Coordinate your businesses,
            monitor runs in real time, and keep your teams aligned from a single command center.
          </p>
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6 text-sm text-primary/90 shadow-lg">
            <p className="font-medium uppercase tracking-wide">Why teams love Mongooz Boost</p>
            <ul className="mt-3 space-y-2 text-foreground/70">
              <li>• Unified visibility across geo grid intelligence.</li>
              <li>• Instant launchers for every operational workflow.</li>
              <li>• Secure access with owner-grade controls.</li>
            </ul>
          </div>
        </section>

        <Card className="border border-white/5 bg-content1/80 shadow-2xl backdrop-blur-xl">
          <CardHeader className="flex-col items-start gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Welcome back</p>
            <h2 className="text-2xl font-semibold text-foreground">Sign in to orchestrate your operations</h2>
          </CardHeader>
          <CardBody className="space-y-6">
            <form className="space-y-5" onSubmit={handleEmailPassword}>
              <Input
                id="email"
                label="Work email"
                labelPlacement="outside"
                placeholder="you@company.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                isDisabled={loading}
                isRequired
                autoComplete="email"
                variant="bordered"
              />

              <Input
                id="password"
                label="Password"
                labelPlacement="outside"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                isDisabled={loading}
                isRequired
                autoComplete="current-password"
                variant="bordered"
              />

              <Button color="primary" type="submit" className="w-full" isLoading={loading}>
                {loading ? 'Signing you in…' : 'Sign in securely'}
              </Button>
            </form>

            <Divider className="bg-white/10">
              <span className="text-xs uppercase tracking-wide text-foreground/50">or</span>
            </Divider>

            <Button
              color="secondary"
              variant="bordered"
              className="w-full"
              onPress={handleGoogle}
              isDisabled={loading}
            >
              {loading ? 'Preparing Google sign-in…' : 'Continue with Google'}
            </Button>

            {error ? (
              <div className="rounded-xl border border-danger/50 bg-danger/15 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}
          </CardBody>
          <CardFooter className="flex flex-col items-start gap-2 text-xs text-foreground/50">
            <p>Need access? Contact an owner to invite you to the organization.</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
