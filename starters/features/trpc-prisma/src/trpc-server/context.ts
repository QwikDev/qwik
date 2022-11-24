import type { inferAsyncReturnType } from '@trpc/server';

export const createContext = async () => {
  const { PrismaClient } = await import('@prisma/client');
  return {
    prisma: new PrismaClient({
      log: import.meta.env.DEV ? ['query', 'error', 'warn'] : ['error'],
    }),
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;
