import {
  $,
  component$,
  implicit$FirstArg,
  QRL,
  RenderOnce,
  useSignal,
  useWatch$,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import { renderFromServer } from './server-render';
import { createComponent, hydrate, render, ssr } from 'solid-js/web';
import type { Component } from 'solid-js';
import { getHostProps, useWakeupSignal } from './slot';
import type { QwikifyOptions, QwikifyProps } from './types';

export function qwikifyQrl<PROPS extends {}>(
  solidCmp$: QRL<Component<PROPS>>,
  opts?: QwikifyOptions
) {
  return component$<QwikifyProps<PROPS>>((props) => {
    const hostRef = useSignal<Element>();
    const slotRef = useSignal<Element>();
    const [signal, isClientOnly] = useWakeupSignal(props);
    const TagName = opts?.tagName ?? ('qwik-solid' as any);

    // Watch takes cares of updates and partial hydration
    useWatch$(async ({ track }) => {
      const trackedProps = track(() => ({ ...props }));
      track(signal);

      if (!isBrowser) {
        return;
      }

      const Cmp = await solidCmp$.resolve();
      const hostElement = hostRef.value;
      if (hostElement) {
        // hydration
        console.log('Hydrated 💦');
        hydrate(
          () => {
            const slotEl = document.querySelector('q-slot');
            const children = slotEl

            return createComponent(Cmp, { children });
          },
          hostElement,
          {
            renderId: 'foo', // TODO: Make it properly dynamic
          }
        );

        if (isClientOnly || signal.value === false) {
          // render(Cmp, hostElement)
        }
      }
    });
    if (isServer && !isClientOnly) {
      const jsx = renderFromServer('qwik-solid', solidCmp$, hostRef);

      return <RenderOnce>{jsx}</RenderOnce>;
    }

    return (
      <RenderOnce>
        <TagName {...getHostProps(props)}>{SkipRender}</TagName>
        <q-slot ref={slotRef}>
          <Slot></Slot>
        </q-slot>
      </RenderOnce>
    );
  });
}

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
