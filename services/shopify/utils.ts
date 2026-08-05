export function hasValidShopifyAccessToken(token: string | null | undefined): boolean {
  if (!token) return false;

  const normalized = token.trim();
  if (!normalized) return false;
  if (/mock|placeholder|your[_-]?token|seed/i.test(normalized)) return false;

  // With encryption enabled, tokens no longer start with 'shp' in the DB.
  // We just verify it has a reasonable length.
  return normalized.length > 20;
}
