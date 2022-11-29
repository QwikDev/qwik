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
  useStylesScoped$,
  useWatch$,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import { renderFromServer } from './server-render';
import { createComponent, hydrate, render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import type { Component } from 'solid-js';
import { getHostProps, mainExactProps, useWakeupSignal } from './slot';
import type { Internal, QwikifyOptions, QwikifyProps } from './types';

export function qwikifyQrl<PROPS extends {}>(
  solidCmp$: QRL<Component<PROPS & { children?: JSX.Element }>>,
  opts?: QwikifyOptions
) {
  return component$<QwikifyProps<PROPS>>((props) => {
    const { scopeId } = useStylesScoped$(
      `q-slot{display:none} q-slotc,q-slotc>q-slot{display:contents}`
    );
    const hostRef = useSignal<Element>();
    const slotRef = useSignal<Element>();
    const internalState = useSignal<NoSerialize<Internal<PROPS>>>();
    const [signal, isClientOnly] = useWakeupSignal(props);
    const hydrationKeys = {};
    const TagName = opts?.tagName ?? ('qwik-solid' as any);

    // Watch takes cares of updates and partial hydration
    useWatch$(async ({ track }) => {
      const trackedProps = track(() => ({ ...props }));
      track(signal);

      if (!isBrowser) {
        return;
      }

      // Update
      if (internalState.value && hostRef.value) {
        internalState.value.setProps(trackedProps)
      } else {
        const Cmp = await solidCmp$.resolve();
        const hostElement = hostRef.value;
        const [wrappedProps, setProps] = createStore({})

        if (hostElement) {
          // hydration
          const solidFn = isClientOnly ? render : hydrate;

          setProps(hydrationKeys)
          solidFn(() => mainExactProps(slotRef.value, scopeId, Cmp, wrappedProps), hostElement);

          if (isClientOnly || signal.value === false) {
            setProps(trackedProps)
          }
        }

        internalState.value = noSerialize({
          component: Cmp,
          setProps
        });
      }
    });

    if (isServer && !isClientOnly) {
      const jsx = renderFromServer(
        TagName,
        solidCmp$,
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
          ref={async (el: Element) => {
            if (isBrowser) {
              const internalData = internalState.value;
              hostRef.value = el;

              if (internalData && !internalData.component) {
                const Cmp = await solidCmp$.resolve();

                render(() => {
                  const slotEl = slotRef.value;

                  // @ts-expect-error
                  return createComponent(Cmp, { children: slotEl });
                }, hostRef.value);
              }
            } else {
              hostRef.value = el;
            }
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
