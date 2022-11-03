import { z } from 'zod';
import { t } from '../trpc';

export const frameworkRouter = t.router({
	list: t.procedure.input(z.string()).query(
		async ({ ctx, input }) =>
			await ctx.prisma.framework.findMany({
				where: { name: { contains: input || '' } },
			})
	),
});
