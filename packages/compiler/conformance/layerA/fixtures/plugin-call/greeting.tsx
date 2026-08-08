import { native$, nativeFrom } from '@qwik.dev/core';

export const makeGreeting = native$(
  (name: string): string => {
    return `hello ${name}`;
  },
  { rust: nativeFrom('./greeting.rs') }
);
