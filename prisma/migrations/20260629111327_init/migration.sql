-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "variant_maps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "variant_maps_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "inventoryQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "product_cache_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "sourceStoreId" TEXT NOT NULL,
    "destinationStoreId" TEXT NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "updatedQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "webhookEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_logs_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sync_logs_destinationStoreId_fkey" FOREIGN KEY ("destinationStoreId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_shopDomain_key" ON "stores"("shopDomain");

-- CreateIndex
CREATE INDEX "variant_maps_sku_idx" ON "variant_maps"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "variant_maps_storeId_shopifyVariantId_key" ON "variant_maps"("storeId", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "product_cache_sku_idx" ON "product_cache"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_cache_storeId_shopifyVariantId_key" ON "product_cache"("storeId", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "sync_logs_sku_idx" ON "sync_logs"("sku");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_createdAt_idx" ON "sync_logs"("createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_shopDomain_topic_idx" ON "webhook_events"("shopDomain", "topic");
