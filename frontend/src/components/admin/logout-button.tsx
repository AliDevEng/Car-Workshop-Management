'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { notifyError } from './notify';

const logoutResponseSchema = z.null();

export function LogoutButton({
  className,
  /**
   * `lg` is 44 px — the admin touch-target floor. The account block in the
   * navigation asks for it, because signing out of a shared workshop machine
   * should not need a precise tap; the compact header variant keeps `sm`.
   */
  size = 'sm',
}: {
  readonly className?: string;
  readonly size?: 'sm' | 'lg';
}) {
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  async function logout(): Promise<void> {
    setIsPending(true);
    try {
      await apiFetch('/auth/logout', logoutResponseSchema, {
        method: 'POST',
      });
      queryClient.clear();
      router.replace('/admin/logga-in');
      router.refresh();
    } catch (error) {
      notifyError(error);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={className}
      onClick={() => {
        void logout();
      }}
      isPending={isPending}
    >
      <LogOutIcon aria-hidden="true" />
      Logga ut
    </Button>
  );
}
