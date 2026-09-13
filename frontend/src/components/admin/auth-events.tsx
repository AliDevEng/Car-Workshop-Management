'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { adminLoginUrl } from '@/lib/admin/return-to';

export function AuthEvents() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    function handleUnauthorized(): void {
      queryClient.clear();
      const query = searchParams.toString();
      const currentPath = query === '' ? pathname : `${pathname}?${query}`;
      router.replace(adminLoginUrl(currentPath));
    }

    window.addEventListener('verkstad:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('verkstad:unauthorized', handleUnauthorized);
    };
  }, [pathname, queryClient, router, searchParams]);

  return null;
}
