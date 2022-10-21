import {
  component$,
  implicit$FirstArg,
  NoSerialize,
  noSerialize,
  QRL,
  useWatch$,
  SkipRender,
  useSignal,
  Slot,
  RenderOnce,
  useStylesScoped$,
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Root } from 'react-dom/client';
import type { FunctionComponent } from 'react';
import * as client from './client';
import { renderFromServer } from './server-render';
import { getHostProps, main, mainExactProps, useWakeupSignal } from './slot';
import type { Internal, QwikifyOptions, QwikifyProps } from './types';

export function qwikifyQrl<PROPS extends {}>(
  reactCmp$: QRL<FunctionComponent<PROPS & { children?: any }>>,
  opts?: QwikifyOptions
) {
  return component$<QwikifyProps<PROPS>>((props) => {
    const { scopeId } = useStylesScoped$(
      `q-slot{display:none} q-slotc,q-slotc>q-slot{display:contents}`
    );
    const hostRef = useSignal<Element>();
    const slotRef = useSignal<Element>();
    const internalState = useSignal<NoSerialize<Internal<PROPS>>>();
    const [signal, isClientOnly] = useWakeupSignal(props, opts);
    const hydrationKeys = {};
    const TagName = opts?.tagName ?? ('qwik-react' as any);

    // Watch takes cares of updates and partial hydration
    useWatch$(async ({ track }) => {
      const trackedProps = track(() => ({ ...props }));
      track(signal);

      if (!isBrowser) {
        return;
      }

      // Update
      if (internalState.value) {
        if (internalState.value.root) {
          internalState.value.root.render(
            main(slotRef.value, scopeId, internalState.value.cmp, trackedProps)
          );
        }
      } else {
        let root: Root | undefined = undefined;
        const Cmp = await reactCmp$.resolve();
        const hostElement = hostRef.value;
        if (hostElement) {
          // hydration
          root = client.flushSync(() => {
            return client.hydrateRoot(
              hostElement,
              mainExactProps(slotRef.value, scopeId, Cmp, hydrationKeys)
            );
          });
          if (signal.value === false) {
            root.render(main(slotRef.value, scopeId, Cmp, trackedProps));
          }
        }
        internalState.value = noSerialize({
          cmp: Cmp,
          root,
        });
      }
    });

    if (isServer && !isClientOnly) {
      const jsx = renderFromServer(
        TagName,
        reactCmp$,
        scopeId,
        props,
        hostRef,
        slotRef,
        hydrationKeys
      );
      return <RenderOnce>{jsx}</RenderOnce>;
    }

    return (
      <RenderOnce>
        <TagName
          {...getHostProps(props)}
          ref={(el: Element) => {
            queueMicrotask(() => {
              const internalData = internalState.value;
              if (internalData && !internalData.root) {
                const root = (internalData.root = client.createRoot(el));
                root.render(main(slotRef.value, scopeId, internalData.cmp, props));
              }
            });
          }}
        >
          {SkipRender}
        </TagName>
        <q-slot ref={slotRef}>
          <Slot></Slot>
        </q-slot>
      </RenderOnce>
    );
  });
}

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
