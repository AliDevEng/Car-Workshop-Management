import { z } from 'zod';
import { emailSchema } from './primitives.js';
import { userSchema } from './user.js';

/**
 * Session-based authentication — PROJECT_SPEC.md §5.1. There is no token in
 * any response body: the session id travels in a signed, `httpOnly` cookie, so
 * that a cross-site script cannot read it.
 */

/**
 * The password is bounded but not otherwise validated on login. A minimum
 * length here would tell an attacker which of two failed attempts had a
 * plausible password, and §5.1 requires both cases to be indistinguishable —
 * same body, same status, same work done, including the argon2 verify against
 * a dummy hash when the email is unknown.
 */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** `GET /api/auth/me`. A single-resource endpoint returns the object (§8.1). */
export const currentUserSchema = userSchema;
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12, {
    message: 'Det nya lösenordet måste vara minst 12 tecken.',
  }),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

/**
 * The double-submit CSRF token (§5.2), read from a cookie by the browser and
 * echoed in this header on every unsafe method. It is an HMAC bound to the
 * session id, so it must be reissued whenever login or a password change
 * rotates that id — otherwise the user is logged in and cannot save anything.
 */
export const CSRF_TOKEN_HEADER = 'x-csrf-token';
export const CSRF_COOKIE_NAME = 'verkstad_csrf';
export const SESSION_COOKIE_NAME = 'verkstad_session';
