import { component$ } from "@builder.io/qwik";
import { routeAction$, zod$ } from "@builder.io/qwik-city";
import { z } from "zod";

// This is TypeScript type validation test only. It does not actually run.

type MyObject = { value: number; optional?: string };

export const useSimpleObjectAction = routeAction$(async () => {
  return { value: 42 } as MyObject;
});

export const useZodObjectAction = routeAction$(
  async () => {
    return { value: 42 } as MyObject;
  },
  zod$({ name: z.string() }),
);

export default component$(() => {
  const fooAction = useSimpleObjectAction();
  const value = fooAction.value!;
  value satisfies MyObject;
  //

  const fooZodAction = useZodObjectAction();
  const zodValue = fooZodAction.value!;
  if ("failed" in zodValue) {
    zodValue satisfies { failed: true } & z.typeToFlattenedError<{
      name: string;
    }>;
  } else {
    zodValue satisfies MyObject;
  }
  return <>TEST</>;
});
