import { QRL, Signal, Slot, SSRRaw, SSRStream } from '@builder.io/qwik';
import { createSignal } from 'solid-js';
import { createComponent, renderToString, ssr } from 'solid-js/web';

export async function renderFromServer(
  Host: any,
  solidCmp$: QRL<any>,
  hostRef: Signal<HTMLElement | undefined>
) {
  const Cmp = await solidCmp$.resolve();

  let html = renderToString(
    () => {
      const props = {
        children: ssr(`<q-slot><!--SLOT--></q-slot>`),
      };

      return createComponent(Cmp, props);
    },
    {
      renderId: 'foo', // TODO: Make it properly dynamic
    }
  );

  const mark = '<!--SLOT-->';
  const beginningHTML = html.indexOf(mark);

  if (beginningHTML >= 0) {
    const beforeSlot = html.slice(0, beginningHTML);
    const afterSlot = html.slice(beginningHTML + mark.length);

    return (
      <div ref={hostRef}>
        <SSRRaw data={beforeSlot} />
        <Slot />
        <SSRRaw data={afterSlot} />
      </div>
    );
  }

  return <div ref={hostRef} dangerouslySetInnerHTML={html} />;
}
