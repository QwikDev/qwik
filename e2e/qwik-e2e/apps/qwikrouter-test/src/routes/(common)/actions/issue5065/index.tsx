import { component$ } from '@qwik.dev/core';
import { routeAction$, z, zod$ } from '@qwik.dev/router';
import type { ValidatorErrorType } from 'packages/qwik-router/src/runtime/src/types';

// This is a TypeScript type validation test only.

interface MyObject {
  value: number;
  optional?: string;
}

export const useSimpleObjectAction = routeAction$(async () => ({ value: 42 }) as MyObject);

export const useZodObjectAction = routeAction$(
  async () => ({ value: 42 }) as MyObject,
  zod$({ name: z.string() })
);

export default component$(() => {
  const fooAction = useSimpleObjectAction();
  const fooValue = fooAction.value!;
  fooValue satisfies MyObject;

  const zodAction = useZodObjectAction();
  if (zodAction.error) {
    zodAction.error.data satisfies ValidatorErrorType<{
      name: string;
    }>;
  } else {
    const zodValue = zodAction.value!;
    zodValue satisfies MyObject;
  }
  return <>TEST</>;
});
