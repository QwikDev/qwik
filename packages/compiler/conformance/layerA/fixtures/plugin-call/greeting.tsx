import { native$, nativeFile } from '@qwik.dev/core';

export const makeGreeting = native$(
  (name: string): string => {
    return `hello ${name}`;
  },
  { rust: nativeFile('./greeting.rs') }
);
