import { PrismaClient } from '@prisma/client';
import { t } from '../trpc';
import { frameworkRouter } from './framework';

export const appRouter = t.router({
	framework: frameworkRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

// e.g tRPC server side
export const tServer = appRouter.createCaller({ prisma: new PrismaClient() });
