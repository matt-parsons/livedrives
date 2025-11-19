import Link from 'next/link';
import LogoutButton from '@/app/components/LogoutButton';
import { Button } from '@/components/ui/button';
import { getOptionalSession } from '@/lib/authServer';

export default async function AuthSessionToggle({ appearance = 'button' } = {}) {
  const session = await getOptionalSession();
  const isAuthenticated = Boolean(session);

  if (appearance === 'link') {
    if (isAuthenticated) {
      return (
        <LogoutButton variant="link" size="sm" className="app-footer__link">
          Log out
        </LogoutButton>
      );
    }

    return (
      <Link href="/signin" className="app-footer__link">
        Log in
      </Link>
    );
  }

  if (isAuthenticated) {
    return <LogoutButton variant="outline" size="sm" />;
  }

  return (
    <Button asChild size="sm" variant="secondary">
      <Link href="/signin">Log in</Link>
    </Button>
  );
}
