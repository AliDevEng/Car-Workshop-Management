-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('PIECE', 'LITRE', 'HOUR', 'KIT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'STOCKTAKE', 'RETURN');

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" "Unit" NOT NULL,
    "salesPriceOre" INTEGER NOT NULL,
    "purchasePriceOre" INTEGER,
    "vatRateBps" INTEGER NOT NULL DEFAULT 2500,
    "stockQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minimumQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "location" TEXT,
    "oeNumbers" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "balanceAfter" DECIMAL(12,3) NOT NULL,
    "workOrderId" TEXT,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_sku_key" ON "Article"("sku");

-- CreateIndex
CREATE INDEX "Article_isActive_idx" ON "Article"("isActive");

-- CreateIndex
CREATE INDEX "Article_sku_idx" ON "Article" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Article_name_idx" ON "Article" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Article_oeNumbers_idx" ON "Article" USING GIN ("oeNumbers");

-- CreateIndex
CREATE INDEX "StockMovement_articleId_occurredAt_idx" ON "StockMovement"("articleId", "occurredAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
