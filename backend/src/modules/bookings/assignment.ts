import { ValidationError } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * A booking may only be assigned to an **active** member of staff.
 *
 * Shared by confirmation and by the calendar patch, because both write the
 * column and the rule has to be the same on both. It matters more than it
 * looks: a deactivated mechanic left on the calendar keeps appearing in the
 * week view, and — through the partial exclusion constraint — keeps occupying
 * slots that nobody can work.
 *
 * A `400` rather than a `404`: the booking exists and the request is
 * well formed; it is one field in it that names something that does not.
 */
export async function assertAssignableUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const user = await tx.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true },
  });
  if (user === null) {
    throw new ValidationError('Uppgifterna kunde inte valideras.', {
      details: [
        { path: 'assignedUserId', message: 'Mekanikern kunde inte hittas.' },
      ],
    });
  }
}
