-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'SPAM');

-- CreateEnum
CREATE TYPE "RequestedTimeOfDay" AS ENUM ('MORNING', 'AFTERNOON', 'ANY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "regNr" TEXT,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "requestedDate" DATE,
    "requestedTimeOfDay" "RequestedTimeOfDay",
    "serviceTypeIds" TEXT[],
    "message" TEXT,
    "sourceIpHash" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledByUserId" TEXT,
    "handledAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "assignedUserId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingRequest_status_submittedAt_idx" ON "BookingRequest"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingRequestId_key" ON "Booking"("bookingRequestId");

-- CreateIndex
CREATE INDEX "Booking_startsAt_assignedUserId_idx" ON "Booking"("startsAt", "assignedUserId");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_vehicleId_idx" ON "Booking"("vehicleId");

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- B5.4.2–B5.4.4 — no two bookings for the same mechanic may overlap.
--
-- Prisma cannot express an exclusion constraint, so this is hand-written. It
-- is not an optimisation of an application-level check; it is the check.
-- Reading the calendar and then inserting is the classic check-then-act race
-- (CLAUDE.md, "Checking for a booking conflict before inserting"), and two
-- owners confirming into the same slot at the same instant is exactly the case
-- it loses.
--
-- `btree_gist` (enabled in 20260908000000_enable_extensions) is what allows
-- equality on the text mechanic column to sit in a gist index beside the range
-- overlap test. Without it this statement fails, and only when it runs.
--
-- The range is half-open, `[)`: a booking ending at 10:00 and one starting at
-- 10:00 are adjacent, not overlapping, which is how a workshop books a day.
--
-- The constraint is partial, and both halves matter:
--   * an unassigned booking occupies nobody's calendar, so it cannot conflict;
--   * a CANCELLED or NO_SHOW booking must not block the slot it no longer
--     occupies. That list has to stay equal to
--     `BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT` in shared/src/schemas/booking.ts,
--     which a test in shared/tests/schemas.test.ts pins.
--
-- The violation arrives as SQLSTATE 23P01 — never as a Prisma error code, which
-- differs by insert path (B0.10.3). See `booking.repository.ts`.
-- ---------------------------------------------------------------------------

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_per_mechanic"
  EXCLUDE USING gist (
    "assignedUserId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (
    "assignedUserId" IS NOT NULL
    AND "status" NOT IN ('CANCELLED', 'NO_SHOW')
  );

-- A zero-length booking is not a booking, and the constraint above cannot
-- catch one: an empty range overlaps nothing, so two of them in the same slot
-- are both accepted. The service rejects it first (`isPositiveInterval` in
-- shared/time.ts); this is the backstop that makes the rule true of the table
-- rather than of one code path.
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_ends_after_start" CHECK ("endsAt" > "startsAt");
