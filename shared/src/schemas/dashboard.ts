import { z } from 'zod';
import { bookingWithRelationsSchema } from './booking.js';
import { customerSummarySchema } from './customer.js';
import { isoDateSchema, isoDateTimeSchema } from './primitives.js';
import { vehicleSummarySchema } from './vehicle.js';

/**
 * The dashboard — PROJECT_SPEC.md §6.8 (B6.8.2).
 *
 * One endpoint rather than five, because §6.8 describes one screen answering
 * one question — "vad händer idag?" — and five round trips make the answer
 * arrive in pieces that disagree about what "today" is. F5.4.2 still renders a
 * skeleton per card; it just does not need a request per card to do it.
 *
 * The counts are counts and the lists are short on purpose: every card links
 * to the filtered list that already exists (`/api/booking-requests?status=`,
 * `/api/work-orders?status=`, `/api/articles?lowStock=true`), so the dashboard
 * never becomes a second, divergent implementation of those lists.
 */

/** §6.8: "inspection due within 60 days" — the cheapest repeat business. */
export const INSPECTION_DUE_WINDOW_DAYS = 60;

/** Enough rows to act on; the card links to the full list for the rest. */
export const DASHBOARD_LIST_LIMIT = 20;

const countSchema = z.number().int().min(0);

/**
 * A vehicle whose inspection falls due soon, with its owner if it has one — a
 * car nobody has claimed yet is still worth calling about, so the customer is
 * nullable exactly as it is on the vehicle itself (§4.2).
 */
export const inspectionDueVehicleSchema = vehicleSummarySchema.extend({
  nextInspectionDueDate: isoDateSchema,
  customer: customerSummarySchema.nullable(),
});
export type InspectionDueVehicle = z.infer<typeof inspectionDueVehicleSchema>;

/**
 * `date` is optional and interpreted as a **Europe/Stockholm** calendar date
 * (§3.6). Absent means today in Stockholm, which is not always today in UTC —
 * between midnight and 01:00 local the two disagree, and a dashboard that got
 * that wrong would show yesterday's bookings to whoever opens the workshop.
 */
export const dashboardQuerySchema = z.object({
  date: isoDateSchema.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardSchema = z.object({
  /** The Stockholm calendar date this answer describes. */
  date: isoDateSchema,
  /** The UTC window that date covers — 23 or 25 hours across a transition. */
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  /** §6.8.1, in start order. */
  todaysBookings: z.array(bookingWithRelationsSchema),
  /** §6.8.2 — the same number the navigation badge shows. */
  unhandledBookingRequests: countSchema,
  /** §6.8.3 — work that is stuck, and work that is waiting for a customer. */
  awaitingParts: countSchema,
  readyForPickup: countSchema,
  /** §6.8.4. */
  inspectionsDueSoon: z.array(inspectionDueVehicleSchema),
  inspectionsDueSoonCount: countSchema,
  /** §6.8.5 — articles below `minimumQuantity`. */
  lowStockArticles: countSchema,
});
export type Dashboard = z.infer<typeof dashboardSchema>;
