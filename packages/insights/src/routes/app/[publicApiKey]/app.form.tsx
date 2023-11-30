import { z } from 'zod';

export const ApplicationForm = z.object({
  name: z.string().min(1, 'Application name is required.'),
  description: z.string().min(1, 'Application description is required.'),
});

export type ApplicationForm = z.infer<typeof ApplicationForm>;
