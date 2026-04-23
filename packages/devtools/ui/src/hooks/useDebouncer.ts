import { $, QRL } from '@qwik.dev/core';

import { useSignal } from '@qwik.dev/core';

export const useDebouncer = <A extends readonly unknown[], R>(
  fn: QRL<(...args: [...A]) => R>,
  delay: number,
) => {
  const timeoutId = useSignal<number>();

  return $((...args: A) => {
    window.clearTimeout(timeoutId.value);
    timeoutId.value = window.setTimeout(() => {
      fn(...args);
    }, delay);
  });
};
