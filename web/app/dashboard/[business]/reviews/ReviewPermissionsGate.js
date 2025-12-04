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
          Scheduling posts still requires a direct Google Business Profile connection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Reviews are loaded from public search data, but post drafting and publishing run through your GBP account.
          Authorize access with the Google Business Profile API to unlock the scheduler and keep everything in sync.
        </p>
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
