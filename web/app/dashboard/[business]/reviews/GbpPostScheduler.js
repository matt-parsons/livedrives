'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatDateTime(isoString, timezone) {
  if (!isoString) {
    return 'Not scheduled';
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC'
    });

    return formatter.format(new Date(isoString));
  } catch (error) {
    console.error('Failed to format datetime', error);
    return new Date(isoString).toLocaleString();
  }
}

function toDatePart(isoString) {
  if (!isoString) {
    return '';
  }

  return new Date(isoString).toISOString().slice(0, 10);
}

function toTimePart(isoString) {
  if (!isoString) {
    return '';
  }

  return new Date(isoString).toISOString().slice(11, 16);
}

function combineDateTime(datePart, timePart) {
  if (!datePart || !timePart) {
    return null;
  }

  const composed = new Date(`${datePart}T${timePart}:00`);
  return Number.isNaN(composed.getTime()) ? null : composed.toISOString();
}

export default function GbpPostScheduler({ businessId, timezone, initialPosts = [] }) {
  const defaultDateTime = useMemo(() => {
    const base = new Date();
    base.setMinutes(base.getMinutes() + 90);
    return { date: base.toISOString().slice(0, 10), time: base.toISOString().slice(11, 16) };
  }, []);

  const [posts, setPosts] = useState(() => initialPosts ?? []);
  const [idea, setIdea] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [callToAction, setCallToAction] = useState('Learn more');
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledDate, setScheduledDate] = useState(defaultDateTime.date);
  const [scheduledTime, setScheduledTime] = useState(defaultDateTime.time);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setPosts(Array.isArray(initialPosts) ? initialPosts : []);
  }, [initialPosts]);

  const clearForm = useCallback(() => {
    setHeadline('');
    setBody('');
    setCallToAction('Learn more');
    setLinkUrl('');
    setIdea('');
    setScheduledDate(defaultDateTime.date);
    setScheduledTime(defaultDateTime.time);
    setEditingId(null);
  }, [defaultDateTime.date, defaultDateTime.time]);

  const refreshPosts = useCallback(async () => {
    try {
      const response = await fetch(`/api/businesses/${businessId}/gbp-posts`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load scheduled posts.');
      }

      setPosts(Array.isArray(payload.posts) ? payload.posts : []);
    } catch (err) {
      console.error(err);
    }
  }, [businessId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    const scheduledFor = combineDateTime(scheduledDate, scheduledTime);

    if (!scheduledFor) {
      setError('Pick a date and time for this post.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        headline,
        body,
        callToAction,
        linkUrl,
        scheduledFor
      };

      const url = editingId
        ? `/api/businesses/${businessId}/gbp-posts/${editingId}`
        : `/api/businesses/${businessId}/gbp-posts`;
      const method = editingId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save this post.');
      }

      setStatus(editingId ? 'Post updated and rescheduled.' : 'Post scheduled.');
      clearForm();
      await refreshPosts();
    } catch (err) {
      setError(err.message || 'Unable to save this post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (post) => {
    setEditingId(post.id);
    setHeadline(post.headline || '');
    setBody(post.body || '');
    setCallToAction(post.callToAction || 'Learn more');
    setLinkUrl(post.linkUrl || '');
    setScheduledDate(toDatePart(post.scheduledFor));
    setScheduledTime(toTimePart(post.scheduledFor));
    setStatus('Editing scheduled post — remember to save your changes.');
    setError('');
  };

  const handleDelete = async (postId) => {
    setStatus('');
    setError('');

    try {
      const response = await fetch(`/api/businesses/${businessId}/gbp-posts/${postId}`, {
        method: 'DELETE'
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete this post.');
      }

      setPosts((current) => current.filter((item) => item.id !== postId));

      if (editingId === postId) {
        clearForm();
      }
    } catch (err) {
      setError(err.message || 'Unable to delete this post.');
    }
  };

  const handleGenerate = async () => {
    setError('');
    setStatus('');
    setGenerating(true);

    try {
      const response = await fetch(`/api/businesses/${businessId}/gbp-posts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to draft a post right now.');
      }

      setHeadline(data.post?.headline || '');
      setBody(data.post?.body || '');
      setCallToAction(data.post?.callToAction || 'Learn more');
      setLinkUrl(data.post?.linkUrl || '');
      setStatus('Draft created with ChatGPT — review and edit before scheduling.');
    } catch (err) {
      setError(err.message || 'Unable to draft a post right now.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Google Business Profile posts</CardTitle>
        <CardDescription>
          Draft and schedule profile posts without leaving the reviews dashboard. Generate a draft with
          ChatGPT, tweak the copy, and set the exact date and time to publish.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gbp-post-idea">Post idea or offer</Label>
              <textarea
                id="gbp-post-idea"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="Share a promo, service focus, or update for ChatGPT to work with."
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                disabled={generating || submitting}
              />
              <Button type="button" variant="secondary" onClick={handleGenerate} disabled={generating || submitting}>
                {generating ? 'Generating…' : 'Ask ChatGPT to draft'}
              </Button>
              <p className="text-xs text-muted-foreground">
                ChatGPT drafts drop directly into the form below so you can edit before publishing.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="gbp-post-headline">Headline</Label>
                <Input
                  id="gbp-post-headline"
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="Fresh coat sale this week"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gbp-post-body">Post body</Label>
                <textarea
                  id="gbp-post-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Share the details customers need, like pricing, service areas, or timing."
                  className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">Keep it friendly and concise for GBP.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gbp-post-cta">Button label</Label>
                  <Input
                    id="gbp-post-cta"
                    value={callToAction}
                    onChange={(event) => setCallToAction(event.target.value)}
                    placeholder="Book now"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gbp-post-link">Button link (optional)</Label>
                  <Input
                    id="gbp-post-link"
                    type="url"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://your-site.com/booking"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gbp-post-date">Publish date</Label>
                  <Input
                    id="gbp-post-date"
                    type="date"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gbp-post-time">Publish time</Label>
                  <Input
                    id="gbp-post-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(event) => setScheduledTime(event.target.value)}
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">Timezone: {timezone || 'UTC'}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : editingId ? 'Update scheduled post' : 'Schedule post'}
                </Button>
                {editingId ? (
                  <Button type="button" variant="ghost" onClick={clearForm} disabled={submitting}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Scheduled posts</p>
                <p className="text-xs text-muted-foreground">Edit or delete any upcoming posts.</p>
              </div>
              <Button type="button" variant="outline" onClick={refreshPosts} disabled={submitting}>
                Refresh
              </Button>
            </div>

            {posts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                Nothing queued yet. Draft a post to see it here.
              </div>
            ) : null}

            {posts.map((post) => (
              <Card key={post.id} className="border border-border/80 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{post.headline || 'Untitled post'}</CardTitle>
                  <CardDescription>
                    Scheduled for {formatDateTime(post.scheduledFor, timezone)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-relaxed text-foreground/90">{post.body}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {post.callToAction ? <span className="rounded-full bg-muted px-2 py-1">CTA: {post.callToAction}</span> : null}
                    {post.linkUrl ? <span className="rounded-full bg-muted px-2 py-1">Link: {post.linkUrl}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleEdit(post)} disabled={submitting}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(post.id)}
                      disabled={submitting}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
