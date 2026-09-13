'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircleIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  csrfTokenResponseSchema,
  currentUserSchema,
  loginInputSchema,
  type LoginInput,
} from 'shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError } from '@/lib/api';
import { sanitiseAdminReturnTo } from '@/lib/admin/return-to';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const isPending = form.formState.isSubmitting;

  async function submit(input: LoginInput): Promise<void> {
    setError(null);
    try {
      await apiFetch('/auth/csrf', csrfTokenResponseSchema);
      await apiFetch('/auth/login', currentUserSchema, {
        method: 'POST',
        body: input,
      });
      router.replace(sanitiseAdminReturnTo(searchParams.get('returnTo')));
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.code === 'UNAUTHORIZED'
            ? 'E-post eller lösenord stämmer inte.'
            : caught.message,
        );
        return;
      }
      setError('E-post eller lösenord stämmer inte.');
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      {error === null ? null : (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-sharp border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-post</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          aria-invalid={form.formState.errors.email === undefined ? undefined : true}
          {...form.register('email')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Lösenord</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={
            form.formState.errors.password === undefined ? undefined : true
          }
          {...form.register('password')}
        />
      </div>

      <Button type="submit" size="lg" isPending={isPending}>
        Logga in
      </Button>
    </form>
  );
}
