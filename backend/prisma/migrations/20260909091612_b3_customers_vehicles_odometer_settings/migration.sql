-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PRIVATE', 'COMPANY');

-- CreateEnum
CREATE TYPE "OdometerSource" AS ENUM ('WORK_ORDER_IN', 'WORK_ORDER_OUT', 'MANUAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "name" TEXT NOT NULL,
    "orgNumber" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "phoneNormalised" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "anonymisedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registrationNumberDisplay" TEXT NOT NULL,
    "isNonStandardPlate" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "modelYear" INTEGER,
    "vin" TEXT,
    "engineCode" TEXT,
    "fuelType" TEXT,
    "firstRegistrationDate" DATE,
    "lastInspectionDate" DATE,
    "nextInspectionDueDate" DATE,
    "lastKnownOdometerKm" INTEGER,
    "dataFetchedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdometerReading" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "km" INTEGER NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL,
    "source" "OdometerSource" NOT NULL,
    "userId" TEXT,
    "workOrderId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OdometerReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_phoneNormalised_idx" ON "Customer" USING GIN ("phoneNormalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNumber_key" ON "Vehicle"("registrationNumber");

-- CreateIndex
CREATE INDEX "Vehicle_customerId_idx" ON "Vehicle"("customerId");

-- CreateIndex
CREATE INDEX "Vehicle_nextInspectionDueDate_idx" ON "Vehicle"("nextInspectionDueDate");

-- CreateIndex
CREATE INDEX "Vehicle_registrationNumber_idx" ON "Vehicle" USING GIN ("registrationNumber" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Vehicle_registrationNumberDisplay_idx" ON "Vehicle" USING GIN ("registrationNumberDisplay" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Vehicle_make_idx" ON "Vehicle" USING GIN ("make" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Vehicle_model_idx" ON "Vehicle" USING GIN ("model" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "OdometerReading_vehicleId_readAt_idx" ON "OdometerReading"("vehicleId", "readAt");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
