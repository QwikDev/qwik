import { QRL, Signal, Slot, SSRRaw, SSRStream } from '@builder.io/qwik';
import { getHostProps, mainExactProps, getReactProps } from './slot';

export async function renderFromServer(
  Host: any,
  reactCmp$: QRL<any>,
  scopeId: string,
  props: Record<string, any>,
  ref: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  hydrationProps: Record<string, any>
) {
  const [Cmp, server] = await Promise.all([reactCmp$.resolve(), import('./server')]);

  const render = server.renderToString;
  const newProps = getReactProps(props);
  Object.assign(hydrationProps, newProps);
  const html = render(mainExactProps(undefined, scopeId, Cmp, newProps));
  const index = html.indexOf('<!--SLOT-->');
  if (index > 0) {
    const part1 = html.slice(0, index);
    const part2 = html.slice(index + '<!--SLOT-->'.length);
    return (
      <Host ref={ref} {...getHostProps(props)}>
        <SSRStream>
          {async function* () {
            yield <SSRRaw data={part1} />;
            yield (
              <q-slot ref={slotRef}>
                <Slot />
              </q-slot>
            );
            yield <SSRRaw data={part2} />;
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
