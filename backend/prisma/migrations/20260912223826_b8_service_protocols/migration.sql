-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('SERVICE_A', 'SERVICE_B', 'MAJOR_SERVICE', 'TIMING_BELT', 'BRAKE_FLUID', 'AC_SERVICE', 'OTHER');

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "itemsJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProtocol" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "number" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesProtocolId" TEXT,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "odometerKm" INTEGER NOT NULL,
    "performedByUserId" TEXT NOT NULL,
    "checklistTemplateId" TEXT,
    "checklistJson" JSONB NOT NULL,
    "nextServiceDueKm" INTEGER,
    "nextServiceDueDate" DATE,
    "notes" TEXT,
    "documentId" TEXT,
    "finalisedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_serviceType_isActive_idx" ON "ChecklistTemplate"("serviceType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProtocol_number_key" ON "ServiceProtocol"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProtocol_supersedesProtocolId_key" ON "ServiceProtocol"("supersedesProtocolId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProtocol_documentId_key" ON "ServiceProtocol"("documentId");

-- CreateIndex
CREATE INDEX "ServiceProtocol_workOrderId_idx" ON "ServiceProtocol"("workOrderId");

-- CreateIndex
CREATE INDEX "ServiceProtocol_checklistTemplateId_idx" ON "ServiceProtocol"("checklistTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProtocol_workOrderId_revision_key" ON "ServiceProtocol"("workOrderId", "revision");

-- AddForeignKey
ALTER TABLE "ServiceProtocol" ADD CONSTRAINT "ServiceProtocol_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProtocol" ADD CONSTRAINT "ServiceProtocol_supersedesProtocolId_fkey" FOREIGN KEY ("supersedesProtocolId") REFERENCES "ServiceProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProtocol" ADD CONSTRAINT "ServiceProtocol_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProtocol" ADD CONSTRAINT "ServiceProtocol_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProtocol" ADD CONSTRAINT "ServiceProtocol_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
