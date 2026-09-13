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

export function LogoutButton() {
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
      size="sm"
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
