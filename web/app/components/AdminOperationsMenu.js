import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { getOptionalSession } from '@/lib/authServer';
import { Button } from '@/components/ui/button';
import RolePreviewMenuItem from '@/app/components/RolePreviewMenuItem';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

const ADMIN_OPERATION_LINKS = [
  {
    href: '/dashboard/operations',
    label: 'Operations hub',
    description: 'Logs, scheduler, and geo operations overview.'
  },
  {
    href: '/dashboard/operations/users',
    label: 'User directory',
    description: 'Reset passwords, review billing, and remove members.'
  },
  {
    href: '/dashboard/operations?tab=geosearch',
    label: 'GeoSearch log',
    description: 'Inspect recent GeoSearch service output and errors.'
  },
  {
    href: '/dashboard/operations?tab=geo',
    label: 'Geo map runs',
    description: 'Monitor cross-business ranking performance.'
  },
  {
    href: '/dashboard/operations?tab=launcher',
    label: 'Launch ranking report',
    description: 'Start a ranking report for any managed business.'
  },
  {
    href: '/dashboard/get-started',
    label: 'Get Started',
    description: 'Guide new members through trials, business setup, and geo keywords.'
  },
  {
    href: '/dashboard/businesses/new',
    label: 'Add new business',
    description: 'Add a new business.'
  }
];

export default async function AdminOperationsMenu() {
  const session = await getOptionalSession();

  if (!session) {
    return null;
  }

  const hasAdminAccess = session.actualRole === 'admin';

  if (!hasAdminAccess) {
    return <div>{session}</div>;
  }

  const isPreviewing = Boolean(session.previewRole);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="gap-2">
          {isPreviewing ? 'Member preview' : 'Admin tools'}
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Admin workspace controls
          {isPreviewing ? ' · preview mode' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ADMIN_OPERATION_LINKS.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="flex flex-col items-start gap-1">
            <Link href={item.href}>
              <span className="font-semibold leading-tight">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <RolePreviewMenuItem isPreviewing={isPreviewing} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
