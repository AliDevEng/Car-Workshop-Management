-- CreateEnum
CREATE TYPE "RecommendationSeverity" AS ENUM ('OVERDUE', 'DUE_SOON', 'UPCOMING');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ServiceRule" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT,
    "engineCode" TEXT,
    "modelYearFrom" INTEGER,
    "modelYearTo" INTEGER,
    "serviceType" "ServiceType" NOT NULL,
    "intervalKm" INTEGER,
    "intervalMonths" INTEGER,
    "note" TEXT,
    "sourceNote" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecommendation" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "serviceRuleId" TEXT NOT NULL,
    "ruleSnapshotJson" JSONB NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "dueKm" INTEGER,
    "dueDate" DATE,
    "severity" "RecommendationSeverity" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'SUGGESTED',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRule_make_serviceType_isActive_idx" ON "ServiceRule"("make", "serviceType", "isActive");

-- CreateIndex
CREATE INDEX "ServiceRecommendation_severity_status_idx" ON "ServiceRecommendation"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecommendation_vehicleId_serviceType_key" ON "ServiceRecommendation"("vehicleId", "serviceType");

-- AddForeignKey
ALTER TABLE "ServiceRule" ADD CONSTRAINT "ServiceRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecommendation" ADD CONSTRAINT "ServiceRecommendation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecommendation" ADD CONSTRAINT "ServiceRecommendation_serviceRuleId_fkey" FOREIGN KEY ("serviceRuleId") REFERENCES "ServiceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecommendation" ADD CONSTRAINT "ServiceRecommendation_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
