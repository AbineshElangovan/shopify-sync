import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";
import { logAuthEvent } from "@/lib/auth/audit";

export async function GET(request: Request) {
  // Simple auth for cron jobs (in production, use a secure header)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'dev_cron_secret'}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeStores = await prisma.store.findMany({
    where: { authStatus: "AUTHENTICATED", isActive: true },
  });

  const results = {
    total: activeStores.length,
    healthy: 0,
    failed: 0,
    details: [] as any[],
  };

  for (const store of activeStores) {
    try {
      if (!store.accessToken) {
        throw new Error("Token missing from DB (should be impossible via extension)");
      }

      // Instantiate client - this validates the token format
      const client = await getAdminClient(store.shopDomain);
      
      // Make a lightweight API call to verify the token is still valid with Shopify
      await client.request(`
        query {
          shop {
            id
          }
        }
      `);

      results.healthy++;
      results.details.push({ shop: store.shopDomain, status: "OK" });
    } catch (error: any) {
      results.failed++;
      results.details.push({ shop: store.shopDomain, status: "FAILED", error: error.message });
      
      console.error(`[HealthCheck] Store ${store.shopDomain} failed auth check:`, error.message);
      
      // If it's a 401 or token validation error, mark for reauth
      if (error.message.includes("401") || error.message.includes("CRITICAL")) {
        await prisma.store.update({
          where: { id: store.id },
          data: {
            authStatus: "REQUIRES_REAUTH",
            lastAuthFailure: new Date(),
            authFailureReason: `Proactive health check failed: ${error.message}`
          }
        });

        await logAuthEvent(
          store.shopDomain,
          "Health Check Failed",
          false,
          `Token invalid or revoked. Status updated to REQUIRES_REAUTH. Error: ${error.message}`
        );
      }
    }
  }

  return NextResponse.json(results);
}
