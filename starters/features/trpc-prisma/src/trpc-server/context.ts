import { PrismaClient } from '@prisma/client';
import * as trpc from '@trpc/server';

export const createContext = async () => {
  return {
    prisma: new PrismaClient({
      log: import.meta.env.DEV ? ['query', 'error', 'warn'] : ['error'],
    }),
  };
};

export type Context = trpc.inferAsyncReturnType<typeof createContext>;
