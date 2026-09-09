import {
  DASHBOARD_LIST_LIMIT,
  INSPECTION_DUE_WINDOW_DAYS,
  stockholmDate,
  stockholmDayEnd,
  stockholmDayStart,
  type Dashboard,
  type DashboardQuery,
  type InspectionDueVehicle,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateOrNull, toIsoDateTime } from '../../lib/dto-dates.js';
import { belowMinimum } from '../articles/repository.js';
import { listBookingsInWindow } from '../bookings/booking.repository.js';

/**
 * The dashboard (PROJECT_SPEC.md §6.8, B6.8.2).
 *
 * "What is happening today", answered in one request so that every card agrees
 * about what "today" is. The five reads run concurrently — they are
 * independent, and a dashboard that adds up its own latencies is the one
 * nobody leaves open.
 */

/**
 * The Stockholm calendar day the answer describes (§3.6).
 *
 * `new Date()` is a UTC instant and the workshop is not in UTC: between
 * midnight and 01:00 local — 02:00 in summer — "today" in UTC is still
 * yesterday in Stockholm. Whoever opens the workshop at 06:30 would be the one
 * to notice, and only by wondering where the day's bookings went.
 */
function resolveDay(query: DashboardQuery): {
  date: string;
  from: Date;
  to: Date;
} {
  const date = query.date ?? stockholmDate(new Date());
  return {
    date,
    from: stockholmDayStart(date),
    // Exclusive, and derived by advancing the calendar date rather than by
    // adding 24 hours — 29 March is 23 hours long and 25 October is 25.
    to: stockholmDayEnd(date),
  };
}

const inspectionVehicleSelect = {
  id: true,
  registrationNumber: true,
  registrationNumberDisplay: true,
  make: true,
  model: true,
  nextInspectionDueDate: true,
  customer: { select: { id: true, type: true, name: true, phone: true } },
} as const;

type InspectionVehicleRecord = Prisma.VehicleGetPayload<{
  select: typeof inspectionVehicleSelect;
}>;

/**
 * "Inspection due within 60 days" — §6.8's cheapest source of repeat business.
 *
 * The window reaches **backwards** as well as forwards, and both ends matter.
 * A car whose inspection expired last week is more urgent than one due next
 * month, and dropping it off the list the day it expires is exactly when the
 * workshop most wants to ring the owner — so the lower bound is not today.
 * But it is not open-ended either: a car sixteen months overdue has been sold,
 * scrapped or is someone else's problem, and because the list is ordered by
 * due date those are precisely the rows that would fill it and hide every car
 * worth calling about.
 *
 * `nextInspectionDueDate` is a `date` column, so both bounds are UTC midnights
 * — a calendar date, not an instant. The §8.2 index serves this scan.
 */
function inspectionWindow(today: string): Prisma.VehicleWhereInput {
  const midnight = (offsetDays: number): Date => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
  };

  return {
    nextInspectionDueDate: {
      not: null,
      gte: midnight(-INSPECTION_DUE_WINDOW_DAYS),
      lte: midnight(INSPECTION_DUE_WINDOW_DAYS),
    },
  };
}

function toInspectionDueVehicle(
  record: InspectionVehicleRecord,
): InspectionDueVehicle | null {
  const dueDate = toIsoDateOrNull(record.nextInspectionDueDate);
  if (dueDate === null) {
    // Unreachable — the query filters on `not: null` — but the column is
    // nullable and the response schema is not, and `!` is banned (CLAUDE.md).
    return null;
  }

  return {
    id: record.id,
    registrationNumber: record.registrationNumber,
    registrationNumberDisplay: record.registrationNumberDisplay,
    make: record.make,
    model: record.model,
    nextInspectionDueDate: dueDate,
    customer:
      record.customer === null
        ? null
        : {
            id: record.customer.id,
            type: record.customer.type,
            name: record.customer.name,
            phone: record.customer.phone,
          },
  };
}

export async function getDashboard(
  db: Database,
  query: DashboardQuery,
): Promise<Dashboard> {
  const day = resolveDay(query);
  const where = inspectionWindow(day.date);

  const [
    todaysBookings,
    unhandledBookingRequests,
    awaitingParts,
    readyForPickup,
    inspectionRows,
    inspectionsDueSoonCount,
    lowStockArticles,
  ] = await Promise.all([
    // The same window function the calendar uses (B5.5), so the dashboard and
    // the calendar cannot disagree about which bookings belong to a day.
    listBookingsInWindow(db, { from: day.from, to: day.to }),
    db.bookingRequest.count({ where: { status: 'PENDING' } }),
    db.workOrder.count({ where: { status: 'AWAITING_PARTS' } }),
    db.workOrder.count({ where: { status: 'READY_FOR_PICKUP' } }),
    db.vehicle.findMany({
      where,
      select: inspectionVehicleSelect,
      orderBy: [{ nextInspectionDueDate: 'asc' }, { id: 'asc' }],
      take: DASHBOARD_LIST_LIMIT,
    }),
    db.vehicle.count({ where }),
    // The same predicate the low-stock list uses, imported rather than
    // restated: a card and the list it links to must not disagree about what
    // "below minimum" means.
    db.article.count({ where: { isActive: true, ...belowMinimum(db) } }),
  ]);

  return {
    date: day.date,
    from: toIsoDateTime(day.from),
    to: toIsoDateTime(day.to),
    todaysBookings,
    unhandledBookingRequests,
    awaitingParts,
    readyForPickup,
    inspectionsDueSoon: inspectionRows
      .map(toInspectionDueVehicle)
      .filter((vehicle): vehicle is InspectionDueVehicle => vehicle !== null),
    inspectionsDueSoonCount,
    lowStockArticles,
  };
}
