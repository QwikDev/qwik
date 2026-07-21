import * as v from 'valibot';

export const ApplicationForm = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Application name is required.')),
  url: v.pipe(v.string(), v.url('Application URL must be a valid URL.')),
  description: v.pipe(v.string(), v.minLength(1, 'Application description is required.')),
});

export type ApplicationForm = v.InferOutput<typeof ApplicationForm>;
