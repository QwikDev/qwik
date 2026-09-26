import { $, component$, isServer, Slot, useSignal, type JSXOutput, type QRL } from '@qwik.dev/core';

export const errMsg = (e: unknown) => String((e as any)?.message ?? e);

export const CatchFallback = component$((props: { msg: string; id?: string }) => {
  const id = props.id ?? 'catch-fallback';
  const count = useSignal(0);
  return (
    <section id={id}>
      <p id={`${id}-msg`}>caught: {props.msg}</p>
      <button id={`${id}-button`} onClick$={() => count.value++}>
        Touch fallback
      </button>
      <span id={`${id}-count`}>{count.value}</span>
    </section>
  );
});

export const defaultFallback = $((e: unknown) => <CatchFallback msg={errMsg(e)} />);
export const outerFallback = $((e: unknown) => <CatchFallback id="catch-outer" msg={errMsg(e)} />);
export const innerFallback = $((e: unknown) => <CatchFallback id="catch-inner" msg={errMsg(e)} />);

export const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="catch-fallback">
    <p id="catch-fallback-msg">caught: {errMsg(e)}</p>
    <button id="catch-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

export const CatchContent = component$(() => {
  const count = useSignal(0);
  return (
    <section id="catch-content">
      <p>streamed content</p>
      <button id="catch-content-button" onClick$={() => count.value++}>
        Touch content
      </button>
      <span id="catch-content-count">{count.value}</span>
    </section>
  );
});

export const CatchSyncThrower = component$<{ message?: string; clientId?: string }>((props) => {
  if (isServer) {
    throw new Error(props.message ?? 'catch sync boom');
  }
  return <span id={props.clientId ?? 'catch-thrower-client'} />;
});

export const CatchAlwaysThrower = component$<{ message?: string }>((props): JSXOutput => {
  throw new Error(props.message ?? 'catch always boom');
});

export const CatchThrowOnClick = component$<{ idPrefix: string; message: string; label?: string }>(
  (props) => {
    const touched = useSignal(0);
    return (
      <>
        <button
          id={`${props.idPrefix}-throw`}
          onClick$={() => {
            touched.value++;
            throw new Error(props.message);
          }}
        >
          {props.label ?? 'throw on click'}
        </button>
        <span id={`${props.idPrefix}-touched`}>{touched.value}</span>
      </>
    );
  }
);

export const CatchReErrorAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('catch reerror ssr boom')), 50);
    }) as unknown as JSXOutput;
  }
  const runs = ((window as any).__catchReErrorRuns = ((window as any).__catchReErrorRuns ?? 0) + 1);
  if (runs < 2) {
    throw new Error('catch reerror client boom ' + runs);
  }
  return <p id="catch-reerror-recovered">recovered after {runs} runs</p>;
});

export const CatchWrapper = component$(() => (
  <div data-catch-wrapper="">
    <Slot />
  </div>
));

export const CatchWrapAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('catch wrap async boom')), 200);
    }) as unknown as JSXOutput;
  }
  return <p id="catch-wrap-recovered">recovered</p>;
});
