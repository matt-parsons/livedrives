'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
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
      <div className="auth-page">
        <section className="auth-intro">
          <h1>Operational control, beautifully streamlined.</h1>
          <p>
            Step into a refined workspace crafted for clarity and focus. Coordinate your businesses,
            monitor runs in real time, and keep your teams aligned from a single command center.
          </p>
        </section>

        <div className="auth-card">
          <div>
            <h2>Welcome back</h2>
            <p className="auth-subheading">Sign in to orchestrate your Livedrives operations.</p>
          </div>

          <form className="form-grid" onSubmit={handleEmailPassword}>
            <div className="input-field">
              <label className="input-label" htmlFor="email">
                Work email
              </label>
              <input
                id="email"
                className="text-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="input-field">
              <label className="input-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="text-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading}
              />
            </div>

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'Signing you in…' : 'Sign in securely'}
            </button>
          </form>

          <div className="form-separator">or</div>

          <button
            type="button"
            className="secondary-button"
            onClick={handleGoogle}
            disabled={loading}
          >
            {loading ? 'Preparing Google sign-in…' : 'Continue with Google'}
          </button>

          {error ? <div className="error-banner">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
