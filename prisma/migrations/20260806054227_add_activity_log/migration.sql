-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SOLD');

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "productTitle" TEXT NOT NULL,
    "sku" TEXT,
    "eventType" "ActivityEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER,
    "amount" DOUBLE PRECISION,
    "collection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_storeId_idx" ON "activity_logs"("storeId");

-- CreateIndex
CREATE INDEX "activity_logs_sku_idx" ON "activity_logs"("sku");

-- CreateIndex
CREATE INDEX "activity_logs_productTitle_idx" ON "activity_logs"("productTitle");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
