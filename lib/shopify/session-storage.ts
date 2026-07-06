import { Session } from "@shopify/shopify-api";
import { prisma } from "@/lib/db/prisma";

export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    try {
      const user = session.onlineAccessInfo?.associated_user;

      await prisma.session.upsert({
        where: { id: session.id },
        update: {
          shop: session.shop,
          state: session.state,
          isOnline: session.isOnline,
          scope: session.scope || null,
          expires: session.expires || null,
          accessToken: session.accessToken || "",
          userId: user?.id ? BigInt(user.id) : null,
          firstName: user?.first_name || null,
          lastName: user?.last_name || null,
          email: user?.email || null,
          accountOwner: user?.account_owner || false,
          locale: user?.locale || null,
          collaborator: user?.collaborator || null,
          emailVerified: user?.email_verified || null,
        },
        create: {
          id: session.id,
          shop: session.shop,
          state: session.state,
          isOnline: session.isOnline,
          scope: session.scope || null,
          expires: session.expires || null,
          accessToken: session.accessToken || "",
          userId: user?.id ? BigInt(user.id) : null,
          firstName: user?.first_name || null,
          lastName: user?.last_name || null,
          email: user?.email || null,
          accountOwner: user?.account_owner || false,
          locale: user?.locale || null,
          collaborator: user?.collaborator || null,
          emailVerified: user?.email_verified || null,
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

      const onlineAccessInfo = dbSession.userId ? ({
        expires_in: 0,
        associated_user_scope: "",
        associated_user: {
          id: Number(dbSession.userId),
          first_name: dbSession.firstName || "",
          last_name: dbSession.lastName || "",
          email: dbSession.email || "",
          account_owner: dbSession.accountOwner,
          locale: dbSession.locale || "",
          collaborator: dbSession.collaborator || false,
          email_verified: dbSession.emailVerified || false,
        }
      } as any) : undefined;

      const session = new Session({
        id: dbSession.id,
        shop: dbSession.shop,
        state: dbSession.state,
        isOnline: dbSession.isOnline,
        scope: dbSession.scope || undefined,
        expires: dbSession.expires || undefined,
        accessToken: dbSession.accessToken,
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
          const onlineAccessInfo = dbSession.userId ? ({
            expires_in: 0,
            associated_user_scope: "",
            associated_user: {
              id: Number(dbSession.userId),
              first_name: dbSession.firstName || "",
              last_name: dbSession.lastName || "",
              email: dbSession.email || "",
              account_owner: dbSession.accountOwner,
              locale: dbSession.locale || "",
              collaborator: dbSession.collaborator || false,
              email_verified: dbSession.emailVerified || false,
            }
          } as any) : undefined;

          return new Session({
            id: dbSession.id,
            shop: dbSession.shop,
            state: dbSession.state,
            isOnline: dbSession.isOnline,
            scope: dbSession.scope || undefined,
            expires: dbSession.expires || undefined,
            accessToken: dbSession.accessToken,
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