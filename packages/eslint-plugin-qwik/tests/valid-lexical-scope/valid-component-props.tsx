import { component$ } from '@builder.io/qwik';

export interface PropFnInterface<ARGS extends any[], RET> {
  (...args: ARGS): Promise<RET>;
}

export type PropFunction<T extends Function> = T extends (...args: infer ARGS) => infer RET
  ? PropFnInterface<ARGS, RET>
  : never;

export interface Props {
  method$: PropFunction<() => void>;
  method1$: PropFunction<() => void>;
  method2$: PropFunction<() => void> | null;
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
