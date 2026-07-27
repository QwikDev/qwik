import { $, component$, isServer, Slot, useSignal, type JSXOutput, type QRL } from '@qwik.dev/core';

export const errMsg = (e: unknown) => String((e as any)?.message ?? e);

export const EbFallback = component$((props: { msg: string; id?: string }) => {
  const id = props.id ?? 'eb-fallback';
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

// Explicit `$()`: identifier-valued `$`-props aren't extracted (Q34).
export const defaultFallback = $((e: unknown) => <EbFallback msg={errMsg(e)} />);
export const outerFallback = $((e: unknown) => <EbFallback id="eb-outer" msg={errMsg(e)} />);
export const innerFallback = $((e: unknown) => <EbFallback id="eb-inner" msg={errMsg(e)} />);

export const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

export const EbContent = component$(() => {
  const count = useSignal(0);
  return (
    <section id="eb-content">
      <p>streamed content</p>
      <button id="eb-content-button" onClick$={() => count.value++}>
        Touch content
      </button>
      <span id="eb-content-count">{count.value}</span>
    </section>
  );
});

export const EbSyncThrower = component$<{ message?: string; clientId?: string }>((props) => {
  if (isServer) {
    throw new Error(props.message ?? 'eb sync boom');
  }
  return <span id={props.clientId ?? 'eb-thrower-client'} />;
});

// Throws in BOTH environments, so a reset re-derives the same failure.
export const EbAlwaysThrower = component$<{ message?: string }>((props): JSXOutput => {
  throw new Error(props.message ?? 'eb always boom');
});

// Increments `touched` BEFORE throwing so a blocked-import test can prove the handler never ran.
export const EbThrowOnClick = component$<{ idPrefix: string; message: string; label?: string }>(
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

export const EbWrapper = component$(() => (
  <div data-eb-wrapper="">
    <Slot />
  </div>
));

export const EbWrapAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb wrap async boom')), 200);
    }) as unknown as JSXOutput;
  }
  return <p id="eb-wrap-recovered">recovered</p>;
});
