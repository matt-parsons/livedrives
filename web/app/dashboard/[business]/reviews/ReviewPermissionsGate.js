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
          We need permission to connect directly to your Google Business Profile account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Authorize access with the Google Business Profile API so we can calculate real review velocity, sentiment, and rating
          trends. We'll never make any updates to your profile without your approval.
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
