import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentUserSchema } from 'shared';
import { AdminShell } from '@/components/admin/admin-shell';
import { QueryProvider } from '@/lib/api/query-provider';
import { apiFetchServer } from '@/lib/api/server';
import { ApiError } from '@/lib/api';

async function getCurrentUser() {
  try {
    return await apiFetchServer('/auth/me', currentUserSchema);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
      redirect('/admin/logga-in');
    }
    throw error;
  }
}

export default async function AuthenticatedAdminLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <QueryProvider>
      <AdminShell user={user}>{children}</AdminShell>
    </QueryProvider>
  );
}
