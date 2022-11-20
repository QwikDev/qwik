import { QRL, Signal, SSRStream } from '@builder.io/qwik';
import { createSignal } from 'solid-js';
import { renderToString } from 'solid-js/web';

export async function renderFromServer(
  Host: any,
  solidCmp$: QRL<any>,
  hostRef: Signal<HTMLElement | undefined>
) {
  const Cmp = await solidCmp$.resolve();

  let html = renderToString(() => Cmp);


  return <div ref={hostRef} dangerouslySetInnerHTML={html} />;
}
