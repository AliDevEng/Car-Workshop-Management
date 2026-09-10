-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTE', 'SERVICE_PROTOCOL');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "number" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesQuoteId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" DATE NOT NULL,
    "netOre" INTEGER NOT NULL,
    "vatOre" INTEGER NOT NULL,
    "grossOre" INTEGER NOT NULL,
    "roundingOre" INTEGER NOT NULL,
    "documentId" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "respondedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "WorkOrderLineType" NOT NULL,
    "articleId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitPriceOre" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_number_key" ON "Document"("number");

-- CreateIndex
CREATE INDEX "Document_type_generatedAt_idx" ON "Document"("type", "generatedAt");

-- CreateIndex
CREATE INDEX "Document_generatedByUserId_idx" ON "Document"("generatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_supersedesQuoteId_key" ON "Quote"("supersedesQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_documentId_key" ON "Quote"("documentId");

-- CreateIndex
CREATE INDEX "Quote_workOrderId_idx" ON "Quote"("workOrderId");

-- CreateIndex
CREATE INDEX "Quote_status_validUntil_idx" ON "Quote"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_workOrderId_revision_key" ON "Quote"("workOrderId", "revision");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_sortOrder_idx" ON "QuoteLine"("quoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuoteLine_articleId_idx" ON "QuoteLine"("articleId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_supersedesQuoteId_fkey" FOREIGN KEY ("supersedesQuoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
