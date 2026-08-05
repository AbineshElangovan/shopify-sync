import { Session } from "@shopify/shopify-api";
import { prisma } from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/utils/encryption";

export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    try {
      const user = session.onlineAccessInfo?.associated_user;

      // Ensure we don't accidentally wipe out an existing valid access token
      const incomingToken = session.accessToken || "";
      let finalToken = incomingToken;
      
      if (!incomingToken) {
        const existingSession = await prisma.session.findUnique({ where: { id: session.id } });
        finalToken = existingSession?.accessToken || "";
        console.warn(`[CustomSessionStorage] Warning: SDK attempted to store session ${session.id} with blank token. Preserving existing token.`);
      }

      console.log("Saving Session");
      console.log(session.shop);
      console.log("Has Access Token:", !!session.accessToken);

      await prisma.session.upsert({
        where: { id: session.id },
        update: {
          shop: session.shop,
          state: session.state,
          isOnline: session.isOnline,
          scope: session.scope || null,
          expires: session.expires || null,
          accessToken: finalToken ? encrypt(finalToken) : "",
          refreshToken: session.refreshToken ? encrypt(session.refreshToken) : null,
          refreshTokenExpires: session.refreshTokenExpires || null,
        },
        create: {
          id: session.id,
          shop: session.shop,
          state: session.state,
          isOnline: session.isOnline,
          scope: session.scope || null,
          expires: session.expires || null,
          accessToken: finalToken ? encrypt(finalToken) : "",
          refreshToken: session.refreshToken ? encrypt(session.refreshToken) : null,
          refreshTokenExpires: session.refreshTokenExpires || null,
        },
      });
      return true;
    } catch (error) {
      console.error("[CustomSessionStorage] storeSession failed:", error);
      return false;
    }
  },

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const dbSession = await prisma.session.findUnique({
        where: { id },
      });
      if (!dbSession) return undefined;

      const onlineAccessInfo = undefined;

      let decryptedAccessToken = dbSession.accessToken;
      let decryptedRefreshToken = dbSession.refreshToken || undefined;

      try {
        if (dbSession.accessToken && dbSession.accessToken.includes(':')) {
           decryptedAccessToken = decrypt(dbSession.accessToken);
        }
        if (dbSession.refreshToken && dbSession.refreshToken.includes(':')) {
           decryptedRefreshToken = decrypt(dbSession.refreshToken);
        }
      } catch (e) {
        console.error("Failed to decrypt session tokens", e);
      }

      const session = new Session({
        id: dbSession.id,
        shop: dbSession.shop,
        state: dbSession.state,
        isOnline: dbSession.isOnline,
        scope: dbSession.scope || undefined,
        expires: dbSession.expires || undefined,
        accessToken: decryptedAccessToken,
        refreshToken: decryptedRefreshToken,
        refreshTokenExpires: dbSession.refreshTokenExpires || undefined,
        onlineAccessInfo,
      });
      return session;
    } catch (error) {
      console.error("[CustomSessionStorage] loadSession failed:", error);
      return undefined;
    }
  },

  async deleteSession(id: string): Promise<boolean> {
    try {
      await prisma.session.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      console.error("[CustomSessionStorage] deleteSession failed:", error);
      return false;
    }
  },

  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      await prisma.session.deleteMany({
        where: { id: { in: ids } },
      });
      return true;
    } catch (error) {
      console.error("[CustomSessionStorage] deleteSessions failed:", error);
      return false;
    }
  },

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const dbSessions = await prisma.session.findMany({
        where: { shop },
      });
      return dbSessions.map(
        (dbSession) => {
          const onlineAccessInfo = undefined;

          let decryptedAccessToken = dbSession.accessToken;
          let decryptedRefreshToken = dbSession.refreshToken || undefined;

          try {
            if (dbSession.accessToken && dbSession.accessToken.includes(':')) {
               decryptedAccessToken = decrypt(dbSession.accessToken);
            }
            if (dbSession.refreshToken && dbSession.refreshToken.includes(':')) {
               decryptedRefreshToken = decrypt(dbSession.refreshToken);
            }
          } catch (e) {
            console.error("Failed to decrypt session tokens", e);
          }

          return new Session({
            id: dbSession.id,
            shop: dbSession.shop,
            state: dbSession.state,
            isOnline: dbSession.isOnline,
            scope: dbSession.scope || undefined,
            expires: dbSession.expires || undefined,
            accessToken: decryptedAccessToken,
            refreshToken: decryptedRefreshToken,
            refreshTokenExpires: dbSession.refreshTokenExpires || undefined,
            onlineAccessInfo,
          });
        }
      );
    } catch (error) {
      console.error("[CustomSessionStorage] findSessionsByShop failed:", error);
      return [];
    }
  },
};