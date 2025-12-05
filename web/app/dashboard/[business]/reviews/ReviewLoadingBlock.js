'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReviewLoadingBlock({ authorizationUrl }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>We’re gathering your reviews</CardTitle>
        <CardDescription>Hang tight while we pull the latest review snapshot.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        {authorizationUrl ? (
          <p className="text-sm text-muted-foreground">
            We’ll check your DataForSEO and Google Business Profile sources and refresh this view.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            We’ll check your DataForSEO source and refresh this view.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
