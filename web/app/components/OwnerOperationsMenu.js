import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { AuthError, requireAuth } from '@/lib/authServer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

const OWNER_OPERATION_LINKS = [
  {
    href: '/dashboard/operations',
    label: 'Operations hub',
    description: 'Logs, scheduler, and geo operations overview.'
  },
  {
    href: '/dashboard/operations?tab=geosearch',
    label: 'GeoSearch log',
    description: 'Inspect recent GeoSearch service output and errors.'
  },
  {
    href: '/dashboard/operations?tab=geo',
    label: 'Geo map runs',
    description: 'Monitor cross-business geo grid performance.'
  },
  {
    href: '/dashboard/operations?tab=launcher',
    label: 'Launch geo grid',
    description: 'Start a geo grid run for any managed business.'
  }
];

export default async function OwnerOperationsMenu() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      return null;
    }

    throw error;
  }

  if (session.role !== 'owner') {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="gap-2">
          Owner tools
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Owner workspace controls
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OWNER_OPERATION_LINKS.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="flex flex-col items-start gap-1">
            <Link href={item.href}>
              <span className="font-semibold leading-tight">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
