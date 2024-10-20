import { type QRL, type Signal, Slot, SSRComment, SSRRaw, SSRStream } from '@builder.io/qwik';
import { getHostProps, mainExactProps, getReactProps } from './slot';
import { renderToString } from 'react-dom/server';
import { isServer } from '@builder.io/qwik/build';

export async function renderFromServer(
  Host: any,
  reactCmp$: QRL<any>,
  scopeId: string,
  props: Record<string, any>,
  ref: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  hydrationProps: Record<string, any>
) {
  if (isServer) {
    const Cmp = await reactCmp$.resolve();

    const newProps = getReactProps(props);
    Object.assign(hydrationProps, newProps);
    const html = renderToString(mainExactProps(undefined, scopeId, Cmp, newProps));
    const index = html.indexOf('<!--SLOT-->');
    if (index > 0) {
      const part1 = html.slice(0, index);
      const part2 = html.slice(index + '<!--SLOT-->'.length);
      return (
        <Host ref={ref} {...getHostProps(props)}>
          <SSRStream>
            {async function* () {
              yield <SSRComment data="q:ignore" />;
              yield <SSRRaw data={part1} />;
              yield <SSRComment data="q:container-island" />;
              yield (
                <q-slot ref={slotRef}>
                  <Slot />
                </q-slot>
              );
              yield <SSRComment data="/q:container-island" />;
              yield <SSRRaw data={part2} />;
              yield <SSRComment data="/q:ignore" />;
            }}
          </SSRStream>
        </Host>
      );
    }
    return (
      <>
        <Host ref={ref}>
          <SSRComment data="q:container=html" />
          <SSRRaw data={html}></SSRRaw>
          <SSRComment data="/q:container" />
        </Host>
        <q-slot ref={slotRef}>
          <Slot />
        </q-slot>
      </>
    );
  }
}
