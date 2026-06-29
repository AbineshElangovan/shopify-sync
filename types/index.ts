
export type SyncStatus = 'SYNCED' | 'SKIPPED' | 'FAILED' | 'PENDING'
export type TriggerType = 'WEBHOOK' | 'MANUAL' | 'SCHEDULED'

export interface Store {
  id: string
  shopDomain: string
  label: string | null
  isActive: boolean
  installedAt: string
}

export interface VariantMap {
  id: string
  sku: string
  storeId: string
  shopifyProductId: string
  shopifyVariantId: string
  inventoryItemId: string
  locationId: string | null
}

export interface ProductCache {
  id: string
  storeId: string
  shopifyProductId: string
  shopifyVariantId: string
  sku: string | null
  title: string
  imageUrl: string | null
  inventoryQuantity: number
  updatedAt: string
}

export interface SyncLog {
  id: string
  sku: string
  sourceStoreId: string
  destinationStoreId: string
  previousQuantity: number
  updatedQuantity: number
  status: SyncStatus
  failureReason: string | null
  triggerType: TriggerType
  webhookEventId: string | null
  createdAt: string
}

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface DashboardStats {
  totalProducts: number
  connectedStores: number
  syncSuccess: number
  syncFailed: number
  recentLogs: SyncLog[]
}

export interface InventoryWebhookPayload {
  inventory_item_id: number
  location_id: number
  available: number
  updated_at: string
}
