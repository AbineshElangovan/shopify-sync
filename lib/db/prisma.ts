import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if ((model === 'Store' || model === 'Session') && 
              ['create', 'update', 'upsert', 'updateMany'].includes(operation)) {
            
            const validateToken = (data: any) => {
              if (!data) return;
              if ('accessToken' in data) {
                const token = data.accessToken;
                if (typeof token === 'string' && token.trim() === '') {
                  throw new Error(`[Prisma Extension] CRITICAL: Attempted to save empty accessToken in ${model}`);
                }
                if (token === null || token === undefined) {
                  throw new Error(`[Prisma Extension] CRITICAL: Attempted to save null/undefined accessToken in ${model}`);
                }
              }
            };

            if ((args as any).data) validateToken((args as any).data);
            
            if (operation === 'upsert') {
              if ((args as any).create) validateToken((args as any).create);
              if ((args as any).update) validateToken((args as any).update);
            }
          }
          
          return query(args);
        }
      }
    }
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined
}

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
