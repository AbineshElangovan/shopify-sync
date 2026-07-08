export function hasValidShopifyAccessToken(token: string | null | undefined): boolean {
  if (!token) return false;

  const normalized = token.trim();
  if (!normalized) return false;
  if (/mock|placeholder|your[_-]?token|seed/i.test(normalized)) return false;

  return normalized.startsWith('shp');
}
