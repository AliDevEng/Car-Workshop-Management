/**
 * A `YYYY-MM-DD` calendar date as a value for a `@db.Date` column.
 *
 * **Midday UTC, not midnight**, and this is load-bearing: the driver renders a
 * `date` parameter through the session's timezone, and midnight UTC in a
 * session an hour ahead is the previous day at 23:00 — which stores the wrong
 * date. Midday leaves twelve hours of slack either way, so no timezone this
 * application can meet moves the calendar date.
 *
 * Shared by `quotes/service.ts` (`validUntil`) and `service-protocols/service.ts`
 * (`nextServiceDueDate`) — both write a bare calendar date to a `@db.Date`
 * column, and the trap is subtle enough that a second private copy is a second
 * chance to get the twelve hours wrong.
 */
export function toDateColumn(localDate: string): Date {
  return new Date(`${localDate}T12:00:00.000Z`);
}
