-- CreateEnum
CREATE TYPE "PartnerLinkPlaceholderType" AS ENUM ('REGNR', 'ARTICLE_NUMBER', 'FREE_TEXT');

-- CreateTable
CREATE TABLE "VehicleDataSnapshot" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleDataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "urlTemplate" TEXT NOT NULL,
    "placeholderType" "PartnerLinkPlaceholderType" NOT NULL,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PartnerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleDataSnapshot_vehicleId_fetchedAt_idx" ON "VehicleDataSnapshot"("vehicleId", "fetchedAt");

-- CreateIndex
CREATE INDEX "PartnerLink_isActive_sortOrder_idx" ON "PartnerLink"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "VehicleDataSnapshot" ADD CONSTRAINT "VehicleDataSnapshot_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
