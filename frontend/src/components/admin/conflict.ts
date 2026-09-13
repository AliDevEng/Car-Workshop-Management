import { ApiError } from '@/lib/api';

export function isConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'CONFLICT';
}

export function conflictMessage(error: unknown): string | null {
  if (!isConflictError(error)) {
    return null;
  }

  return 'Uppgifterna har ändrats av någon annan. Ladda om sidan och kontrollera innan du sparar igen.';
}
