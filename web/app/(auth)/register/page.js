'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const isSubmitting = status === 'submitting';
  const isComplete = status === 'success';

  const namePlaceholder = useMemo(() => {
    if (!email) return 'Ada Lovelace';
    const localPart = email.split('@')[0] ?? '';
    if (!localPart) return 'Ada Lovelace';
    return localPart
      .split(/[._-]/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }, [email]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!emailPattern.test(email.trim().toLowerCase())) {
      setError('Please provide a valid email address.');
      return;
    }

    setStatus('submitting');

    try {
      const response = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim()
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data.error || 'Registration failed. Please try again.');
      }

      setStatus('success');
    } catch (err) {
      setStatus('idle');
      setError(err.message || 'Unable to submit registration right now.');
    }
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 lg:grid lg:grid-cols-2 lg:items-start">
        <section className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur">
          <h1 className="text-3xl font-semibold text-foreground">Start your Local Paint Pilot journey</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Share a name and the best email to reach you and we&apos;ll spin up your workspace, trial, and onboarding guide.
            You&apos;ll be the owner of the organization we create, ready to invite your team and launch your first drive.
          </p>
        </section>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Claim your spot</CardTitle>
            <CardDescription>We&apos;ll create your account and kick off the new member journey.</CardDescription>
          </CardHeader>

          <CardContent>
            {isComplete ? (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-4 py-3 text-emerald-600">
                  You&apos;re all set! Check your inbox for next steps—we&apos;ve created your workspace and trial.
                </p>
                <p>
                  Keep an eye on your email for onboarding resources and sign-in instructions. If you have any questions,
                  just reply to the welcome message and we&apos;ll help you get rolling.
                </p>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={namePlaceholder}
                    autoComplete="name"
                    disabled={isSubmitting}
                  />
                </div>

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

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting…' : 'Kick off my journey'}
                </Button>
              </form>
            )}
          </CardContent>

          {!isComplete && (
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
                  We&apos;ll send onboarding details to your inbox and handle the Firebase and database setup for you.
                </p>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
