-- CreateEnum
CREATE TYPE "CollectionSource" AS ENUM ('SHOPIFY');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuthStatus" AS ENUM ('AUTHENTICATED', 'REQUIRES_REAUTH', 'INVALID_TOKEN', 'UNINSTALLED', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PriceAdjustmentType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "uniqueStoreId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyStoreId" TEXT,
    "accessToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT,
    "masterLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priceAdjustmentValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "priceAdjustmentType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "isPriceAdjustmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "authStatus" "AuthStatus" NOT NULL DEFAULT 'AUTHENTICATED',
    "lastAuthFailure" TIMESTAMP(3),
    "authFailureReason" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_connections" (
    "id" TEXT NOT NULL,
    "sourceStoreId" TEXT NOT NULL,
    "targetStoreId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_maps" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "inventoryItemId" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cache" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "tags" TEXT,
    "imageUrl" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "inventoryQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "sourceStoreId" TEXT NOT NULL,
    "destinationStoreId" TEXT NOT NULL,
    "previousQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "webhookEventId" TEXT,
    "syncType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "webhookTopic" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestId" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyCollectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "source" "CollectionSource" NOT NULL DEFAULT 'SHOPIFY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "productCacheId" TEXT NOT NULL,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "skuPrefix" TEXT NOT NULL DEFAULT 'SKU',
    "skuSequence" INTEGER NOT NULL DEFAULT 1,
    "isSkuGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_mappings" (
    "id" TEXT NOT NULL,
    "productUniqueId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "sku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_unique_id_sequence" (
    "id" TEXT NOT NULL DEFAULT 'product',
    "currentSequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_unique_id_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_base_skus" (
    "id" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "baseSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_base_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_base_skus" (
    "id" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "baseSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_base_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_queue" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "apiVersion" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_audits" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_queue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "failedAttempts" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_price_adjustments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "adjustmentType" "PriceAdjustmentType" NOT NULL DEFAULT 'PERCENTAGE',
    "adjustmentValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_price_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_sku_rules" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "skuPrefix" TEXT NOT NULL DEFAULT '',
    "startSequence" INTEGER NOT NULL DEFAULT 1,
    "currentSequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_sku_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_uniqueStoreId_key" ON "stores"("uniqueStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "stores_shopDomain_key" ON "stores"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "stores_masterLabel_key" ON "stores"("masterLabel");

-- CreateIndex
CREATE UNIQUE INDEX "store_connections_sourceStoreId_targetStoreId_key" ON "store_connections"("sourceStoreId", "targetStoreId");

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
CREATE UNIQUE INDEX "sync_logs_webhookEventId_syncType_destinationStoreId_key" ON "sync_logs"("webhookEventId", "syncType", "destinationStoreId");

-- CreateIndex
CREATE INDEX "webhook_events_shopDomain_topic_idx" ON "webhook_events"("shopDomain", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "collections_storeId_shopifyCollectionId_key" ON "collections"("storeId", "shopifyCollectionId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_products_collectionId_productCacheId_key" ON "collection_products"("collectionId", "productCacheId");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_storeId_key" ON "store_settings"("storeId");

-- CreateIndex
CREATE INDEX "product_mappings_productUniqueId_idx" ON "product_mappings"("productUniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "product_mappings_storeId_shopifyVariantId_key" ON "product_mappings"("storeId", "shopifyVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_base_skus_storeId_shopifyProductId_key" ON "product_base_skus"("storeId", "shopifyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_base_skus_storeId_shopifyVariantId_key" ON "variant_base_skus"("storeId", "shopifyVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_queue_webhookId_key" ON "webhook_queue"("webhookId");

-- CreateIndex
CREATE INDEX "webhook_queue_status_createdAt_idx" ON "webhook_queue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_queue_shopDomain_topic_idx" ON "webhook_queue"("shopDomain", "topic");

-- CreateIndex
CREATE INDEX "auth_audits_shopDomain_idx" ON "auth_audits"("shopDomain");

-- CreateIndex
CREATE INDEX "auth_audits_createdAt_idx" ON "auth_audits"("createdAt");

-- CreateIndex
CREATE INDEX "dead_letter_queue_storeId_idx" ON "dead_letter_queue"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_price_adjustments_storeId_collectionId_key" ON "collection_price_adjustments"("storeId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_sku_rules_storeId_collectionId_key" ON "collection_sku_rules"("storeId", "collectionId");

-- AddForeignKey
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_targetStoreId_fkey" FOREIGN KEY ("targetStoreId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_maps" ADD CONSTRAINT "variant_maps_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cache" ADD CONSTRAINT "product_cache_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_destinationStoreId_fkey" FOREIGN KEY ("destinationStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_productCacheId_fkey" FOREIGN KEY ("productCacheId") REFERENCES "product_cache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_base_skus" ADD CONSTRAINT "product_base_skus_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_base_skus" ADD CONSTRAINT "variant_base_skus_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_price_adjustments" ADD CONSTRAINT "collection_price_adjustments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_price_adjustments" ADD CONSTRAINT "collection_price_adjustments_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_sku_rules" ADD CONSTRAINT "collection_sku_rules_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_sku_rules" ADD CONSTRAINT "collection_sku_rules_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

