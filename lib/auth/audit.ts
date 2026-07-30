import { prisma } from "@/lib/db/prisma";

export async function logAuthEvent(
  shopDomain: string,
  event: string,
  success: boolean,
  message?: string
) {
  try {
    await prisma.authAudit.create({
      data: {
        shopDomain,
        event,
        success,
        message,
      },
    });
  } catch (error) {
    console.error(`[AuthAudit] Failed to log event ${event} for ${shopDomain}:`, error);
  }
}
