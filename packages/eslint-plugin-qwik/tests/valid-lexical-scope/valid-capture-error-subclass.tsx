import { component$, useTask$, useSignal } from '@qwik.dev/core';

// Error subclasses serialize as plain Errors (qwik serializes `instanceof Error`), so capturing
// one in a $ scope is allowed — just like capturing a plain `Error`.
class ServerError<T = unknown> extends Error {
  constructor(
    public status: number,
    public data: T
  ) {
    super();
  }
}

export const HelloWorld = component$(() => {
  const err = useSignal<ServerError<{ message: string }> | undefined>();
  useTask$(() => {
    err.value = new ServerError(404, { message: 'not found' });
  });
  return <div>{err.value?.status}</div>;
});
