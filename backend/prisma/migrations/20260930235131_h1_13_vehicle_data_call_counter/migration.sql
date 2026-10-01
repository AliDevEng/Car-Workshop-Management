-- CreateTable
CREATE TABLE "VehicleDataCallCounter" (
    "key" TEXT NOT NULL,
    "windowStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VehicleDataCallCounter_pkey" PRIMARY KEY ("key")
);
