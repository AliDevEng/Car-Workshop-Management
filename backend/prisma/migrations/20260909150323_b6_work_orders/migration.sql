-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'AWAITING_PARTS', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderLineType" AS ENUM ('LABOUR', 'PART', 'FEE');

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "bookingId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "odometerKmIn" INTEGER,
    "odometerKmOut" INTEGER,
    "assignedUserId" TEXT,
    "description" TEXT NOT NULL,
    "internalNote" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "completedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderLine" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "WorkOrderLineType" NOT NULL,
    "articleId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitPriceOre" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "stockDeducted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");

-- CreateIndex
CREATE INDEX "WorkOrder_vehicleId_idx" ON "WorkOrder"("vehicleId");

-- CreateIndex
CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");

-- CreateIndex
CREATE INDEX "WorkOrder_bookingId_idx" ON "WorkOrder"("bookingId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedUserId_idx" ON "WorkOrder"("assignedUserId");

-- CreateIndex
CREATE INDEX "WorkOrderLine_workOrderId_sortOrder_idx" ON "WorkOrderLine"("workOrderId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkOrderLine_articleId_idx" ON "WorkOrderLine"("articleId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_userId_idx" ON "IdempotencyKey"("userId");

-- CreateIndex
CREATE INDEX "OdometerReading_workOrderId_idx" ON "OdometerReading"("workOrderId");

-- CreateIndex
CREATE INDEX "StockMovement_workOrderId_idx" ON "StockMovement"("workOrderId");

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Document numbering — PROJECT_SPEC.md §4.4 (B6.1.2).
--
-- `AO-2026-0001`, resetting each calendar year, from a **Postgres sequence per
-- type per year**, drawn inside the transaction that assigns the number.
-- `SELECT MAX(number) + 1` is what this exists to avoid: it produces duplicates
-- the first time two people click at once, and the duplicate lands on a column
-- carrying a unique index, so the second click fails with a 500 rather than
-- getting the next number.
--
-- The sequences cannot all be created here — the workshop will still be running
-- in 2031 — so they are created on first use. That is DDL, and the DDL is where
-- the interesting race is: two transactions creating the same new year's
-- sequence at the same moment do **not** both succeed. One fails with
-- `duplicate_table`, which would be a 500 on the first work order of January
-- and impossible to reproduce afterwards.
--
-- **Catching that exception is the guard, and a check-then-create is not.** An
-- earlier version of this function took an advisory lock and re-checked
-- `to_regclass` inside it; a 25-way concurrency test found it still raised
-- `42P07`. The reason is worth writing down: the whole function body runs as
-- one command, so its **catalogue snapshot is fixed for the duration**. The
-- re-check after the lock therefore looks at the same catalogue as the first
-- check and still reports NULL, however long the caller waited. A lock cannot
-- fix a stale read. `CREATE SEQUENCE` itself blocks on `pg_class`'s unique
-- index and then either succeeds — because the other transaction rolled back —
-- or raises, so letting it run and handling both outcomes is both simpler and
-- the only version that is actually correct.
--
-- **Two SQLSTATEs, not one**, and this was also measured rather than assumed.
-- `duplicate_table` (42P07) is what `CREATE SEQUENCE` raises when the name is
-- already visible in its catalogue snapshot. Under a genuine race it never
-- gets that far: it waits on `pg_class_relname_nsp_index` and surfaces
-- `unique_violation` (23505) instead. Handling only the obvious one leaves the
-- concurrent case failing exactly as before.
--
-- After the exception the sequence is committed and visible to the `nextval`
-- below, because the surrounding transaction is READ COMMITTED and each
-- statement takes a fresh snapshot. A caller running this inside a REPEATABLE
-- READ transaction would need to retry; nothing in this codebase does.
--
-- `nextval` is deliberately not transactional. A rolled-back assignment leaves
-- a gap in the series, which is the accepted trade: §4.4 asks for numbers that
-- are unique and increasing, not for numbers that are contiguous.
CREATE OR REPLACE FUNCTION next_document_number(p_prefix text, p_year int)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  seq_name text;
  result   bigint;
BEGIN
  -- Validated here as well as in TypeScript: the arguments are interpolated
  -- into an identifier below, and `format(%I)` quoting is a second line of
  -- defence rather than the only one.
  IF p_prefix !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'document number prefix must be two capitals, got %', p_prefix;
  END IF;
  IF p_year < 2000 OR p_year > 9999 THEN
    RAISE EXCEPTION 'document number year out of range, got %', p_year;
  END IF;

  seq_name := format('document_number_%s_%s', lower(p_prefix), p_year);

  -- The fast path, taken for every call after the first of a year.
  IF to_regclass(format('public.%I', seq_name)) IS NULL THEN
    BEGIN
      EXECUTE format('CREATE SEQUENCE public.%I AS bigint START WITH 1', seq_name);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      -- Another transaction created it while this one waited. Nothing to do:
      -- its sequence is as good as ours, and the draw below uses it.
      NULL;
    END;
  END IF;

  EXECUTE format('SELECT nextval(%L)', format('public.%I', seq_name)) INTO result;
  RETURN result;
END;
$$;
