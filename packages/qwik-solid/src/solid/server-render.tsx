import { QRL, Signal, Slot, SSRRaw, SSRStream } from '@builder.io/qwik';
import { renderToString } from 'solid-js/web';
import { getHostProps, getSolidProps, mainExactProps } from './slot';

export async function renderFromServer(
  Host: any,
  solidCmp$: QRL<any>,
  scopeId: string,
  props: Record<string, any>,
  ref: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  hydrationProps: Record<string, any>
) {
  const Cmp = await solidCmp$.resolve();
  const newProps = getSolidProps(props);
  Object.assign(hydrationProps, newProps);

  const html = renderToString(() => {
    return mainExactProps(undefined, scopeId, Cmp, newProps);
  });

  const mark = '<!--SLOT-->';
  const beginningHTML = html.indexOf(mark);

  if (beginningHTML >= 0) {
    const beforeSlot = html.slice(0, beginningHTML);
    const afterSlot = html.slice(beginningHTML + mark.length);

    return (
      <Host ref={ref} {...getHostProps(props)}>
        <SSRStream>
          {async function* () {
            yield <SSRRaw data={beforeSlot} />;
            yield (
              <q-slot ref={slotRef}>
                <Slot />
              </q-slot>
            );
            yield <SSRRaw data={afterSlot} />;
          }}
        </SSRStream>
      </Host>
    );
  }

  return (
    <>
      <Host ref={ref}>
        <SSRRaw data={html}></SSRRaw>
      </Host>
      <q-slot ref={slotRef}>
        <Slot />
      </q-slot>
    </>
  );
}
