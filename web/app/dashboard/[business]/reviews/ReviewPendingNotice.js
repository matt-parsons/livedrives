'use client';

import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReviewPendingNotice() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start gap-3">
        <AlertCircle className="mt-1 h-5 w-5 text-amber-500" aria-hidden />
        <div>
          <CardTitle>Still collecting reviews</CardTitle>
          <CardDescription>We saved your request and will finish it in the background.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          We&apos;re still gathering your review results. Check back in a bit and we&apos;ll
          automatically populate this page once the task completes.
        </p>
      </CardContent>
    </Card>
  );
}
