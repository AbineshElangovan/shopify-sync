import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "@/lib/db/prisma";

export const sessionStorage = new PrismaSessionStorage(prisma);