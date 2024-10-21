import { type QRL, component$ } from '@qwik.dev/core';

export interface Props {
  method$: QRL<() => void>;
  method1$: QRL<() => void>;
  method2$: QRL<() => void> | null;
  method3$: any;
}

export const HelloWorld = component$<Props>(({ method$, method1$, method2$, method3$ }) => {
  return (
    <div
      onKeydown$={method$}
      onKeydown1$={method1$}
      onKeydown2$={method2$}
      onClick$={async () => {
        await method$();
      }}
    ></div>
  );
});
