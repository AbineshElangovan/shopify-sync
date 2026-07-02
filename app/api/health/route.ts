import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { shopify } from '@/lib/shopify/index';

/**
 * GET /api/health
 *
 * System health check. Returns:
 *  - Database connectivity status for every table
 *  - Environment variable presence check
 *  - Store/Session/ProductCache row counts
 *  - Shopify API config sanity check
 *
 * Safe to call without authentication.
 * Use this to verify the app is working after installation.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string | number }> = {};

  // ── Environment variables ─────────────────────────────────────────────────
  const requiredEnvVars = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_APP_URL',
    'SHOPIFY_SCOPES',
    'DATABASE_URL',
    'NEXT_PUBLIC_SHOPIFY_API_KEY',
  ];

  for (const key of requiredEnvVars) {
    checks[`env.${key}`] = {
      ok: Boolean(process.env[key]),
      detail: process.env[key] ? `present (${process.env[key]!.substring(0, 8)}...)` : 'MISSING',
    };
  }

  // Detect stale tunnel URL (Cloudflare tunnels are ephemeral)
  const appUrl = shopify.config.hostName ? `https://${shopify.config.hostName}` : '';
  checks['env.SHOPIFY_APP_URL.reachable'] = {
    ok: appUrl.includes('trycloudflare.com') || appUrl.includes('ngrok') || appUrl.includes('spin.dev'),
    detail: appUrl || 'not set',
  };

  // ── Database connectivity ─────────────────────────────────────────────────
  try {
    const [sessions, stores, products, variants, syncLogs, webhookEvents] = await Promise.all([
      prisma.session.count(),
      prisma.store.count(),
      prisma.productCache.count(),
      prisma.variantMap.count(),
      prisma.syncLog.count(),
      prisma.webhookEvent.count(),
    ]);

    checks['db.Session'] = { ok: true, detail: sessions };
    checks['db.Store'] = { ok: true, detail: stores };
    checks['db.ProductCache'] = { ok: true, detail: products };
    checks['db.VariantMap'] = { ok: true, detail: variants };
    checks['db.SyncLog'] = { ok: true, detail: syncLogs };
    checks['db.WebhookEvent'] = { ok: true, detail: webhookEvents };
  } catch (err: any) {
    checks['db.connectivity'] = { ok: false, detail: err.message };
  }

  // ── Active stores ─────────────────────────────────────────────────────────
  try {
    const activeStores = await prisma.store.findMany({
      where: { isActive: true },
      select: {
        shopDomain: true,
        isActive: true,
        installedAt: true,
        _count: { select: { productCaches: true } },
      },
    });

    checks['stores.active'] = {
      ok: activeStores.length > 0,
      detail: activeStores.length > 0
        ? activeStores.map((s) => `${s.shopDomain} (${s._count.productCaches} products)`).join(', ')
        : 'No active stores — app not installed yet',
    };
  } catch (err: any) {
    checks['stores.active'] = { ok: false, detail: err.message };
  }

  // ── Overall status ────────────────────────────────────────────────────────
  const allOk = Object.values(checks).every((c) => c.ok);
  const criticalChecks = ['db.Session', 'db.Store', 'db.ProductCache', 'env.SHOPIFY_API_KEY', 'env.SHOPIFY_API_SECRET'];
  const criticalOk = criticalChecks.every((k) => checks[k]?.ok !== false);

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : criticalOk ? 'degraded' : 'critical',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk || criticalOk ? 200 : 503 }
  );
}
