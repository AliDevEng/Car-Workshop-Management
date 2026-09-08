import { z } from 'zod';
import { cursorQuerySchema } from './common.js';
import {
  booleanQuerySchema,
  emailSchema,
  idSchema,
  nameSchema,
  timestampFields,
} from './primitives.js';

/**
 * Staff accounts — PROJECT_SPEC.md §4.2. Two rows in practice; the role split
 * exists so price lists and user management can be locked down later without a
 * migration (§5.3).
 */
export const USER_ROLES = ['ADMIN', 'MECHANIC'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Administratör',
  MECHANIC: 'Mekaniker',
};

export const userRoleSchema = z.enum(USER_ROLES);

/**
 * The API's view of a user. `passwordHash` is absent by construction rather
 * than by discipline: Fastify serialises against this schema, so a repository
 * that accidentally returns the hash has it stripped by the framework (§8.1).
 */
export const userSchema = z.object({
  id: idSchema,
  email: emailSchema,
  name: nameSchema,
  role: userRoleSchema,
  isActive: z.boolean(),
  ...timestampFields,
});
export type User = z.infer<typeof userSchema>;

/**
 * A user as they appear *on* another record — an assigned mechanic, the person
 * who took a stocktake. Enough to render a name, without dragging a full user
 * object through every list response.
 */
export const userSummarySchema = z.object({
  id: idSchema,
  name: nameSchema,
  role: userRoleSchema,
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const createUserInputSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: userRoleSchema,
  password: z.string().min(12, {
    message: 'Lösenordet måste vara minst 12 tecken.',
  }),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

/**
 * `isActive` is not here: deactivation is its own endpoint (B2.6.1), because
 * the last active admin cannot be deactivated and that rule deserves a route
 * rather than a field buried in a patch body. Nothing is ever hard-deleted
 * (§4.3).
 */
export const updateUserInputSchema = z
  .object({
    email: emailSchema,
    name: nameSchema,
    role: userRoleSchema,
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const userListQuerySchema = cursorQuerySchema.extend({
  isActive: booleanQuerySchema.optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userIdParamsSchema = z.object({ id: idSchema });
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
