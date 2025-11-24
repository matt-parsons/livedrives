'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

export default function ReviewPermissionsGate({ authorizationUrl }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Connect Google Business Profile</CardTitle>
        <CardDescription>
          We need permission to pull live reviews directly from your Google Business Profile account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Authorize access with the Google Business Profile API so we can calculate real review velocity, sentiment, and rating
          trends. We only request read-only permissions for reviews.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Connect with the account that manages this location in Google.</li>
          <li>We&rsquo;ll store a refresh token to keep data in sync automatically.</li>
          <li>No data is shown until authorization is granted.</li>
        </ul>
      </CardContent>
      <CardFooter>
        {authorizationUrl ? (
          <Button asChild>
            <a href={authorizationUrl} className="inline-flex items-center gap-2">
              Authorize Google Business Profile
              <ExternalLink size={16} />
            </a>
          </Button>
        ) : (
          <Button disabled>Authorization unavailable</Button>
        )}
      </CardFooter>
    </Card>
  );
}
