import {
  $,
  component$,
  implicit$FirstArg,
  noSerialize,
  NoSerialize,
  QRL,
  RenderOnce,
  SkipRender,
  Slot,
  useSignal,
  useWatch$,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import { renderFromServer } from './server-render';
import { createComponent, hydrate, render, ssr } from 'solid-js/web';
import type { Component } from 'solid-js';
import { getHostProps, useWakeupSignal } from './slot';
import type { Internal, QwikifyOptions, QwikifyProps, SolidProps } from './types';

export function qwikifyQrl<PROPS extends SolidProps>(
  solidCmp$: QRL<Component<PROPS>>,
  opts?: QwikifyOptions
) {
  return component$<QwikifyProps<PROPS>>((props) => {
    const hostRef = useSignal<Element>();
    const internalState = useSignal<NoSerialize<Internal<PROPS>>>();
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

      // Update
      if (internalState.value) {
        // TODO
      } else {
        const Cmp = await solidCmp$.resolve();
        const hostElement = hostRef.value;
        if (hostElement) {
          // hydration
          const solidFn = isClientOnly ? render : hydrate;

          console.log(isClientOnly ? 'Client rendered' : 'Hydrated from server-rendered markup 💦');

          solidFn(
            () => {
              const slotEl = document.querySelector('q-slot');
              const children = slotEl;

              return createComponent(Cmp, { children });
            },
            hostElement,
            {
              renderId: 'foo', // TODO: Make it properly dynamic
            }
          );
        }

        internalState.value = noSerialize({
          cmp: Cmp,
        });
      }
    });

    if (isServer && !isClientOnly) {
      const jsx = renderFromServer('qwik-solid', solidCmp$, hostRef);

      return <RenderOnce>{jsx}</RenderOnce>;
    }

    return (
      <RenderOnce>
        <TagName
          {...getHostProps(props)}
          ref={async (el: Element) => {
            if (isBrowser) {
              const internalData = internalState.value;
              hostRef.value = el;

              if (internalData && !internalData.cmp) {
                const Cmp = await solidCmp$.resolve();
                
                console.log("Rendering on callback")
                
                render(() => {
                  const slotEl = slotRef.value;

                  return createComponent(Cmp, { children: slotEl });
                });
              }
            } else {
              console.log("Setting hostRef by server")
              hostRef.value = el;
            }
          }}
        >
          {SkipRender}
        </TagName>
        <q-slot ref={slotRef} style="display: none">
          <Slot></Slot>
        </q-slot>
      </RenderOnce>
    );
  });
}

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
