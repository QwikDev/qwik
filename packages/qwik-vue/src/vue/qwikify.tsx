import {
  component$,
  implicit$FirstArg,
  NoSerialize,
  QRL,
  RenderOnce,
  Slot,
  useSignal,
  useTask$,
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Internal, QwikifyOptions, QwikifyProps, VueProps } from './types';
import { mountApp } from './client';
import { serverRenderVueQrl } from './server';
import { getHostProps } from './vue.utils';
import { useWakeupSignal } from './wakeUpSignal';
import type { Component } from 'vue';

export function qwikifyQrl<PROPS extends VueProps>(
  vueCmpQrl: QRL<Component>,
  opts?: QwikifyOptions
) {
  return component$<QwikifyProps<PROPS>>((props) => {
    const hostRef = useSignal<Element>();
    const internalState = useSignal<NoSerialize<Internal<VueProps>>>();
    const slotRef = useSignal<Element>();
    const TagName = opts?.tagName ?? ('qwik-vue' as any);

    const [wakeUp, isClientOnly] = useWakeupSignal(props);

    useTask$(async ({ track }) => {
      track(() => wakeUp.value);
      const trackedProps = track(() => ({ ...props }));

      if (isServer) return; // early exit

      // Update Props
      if (internalState.value?.app._instance && internalState.value.updateProps) {
        internalState.value.updateProps(trackedProps);
        internalState.value.app._instance.update();

        return;
      }

      // Mount / hydrate Vue
      mountApp(vueCmpQrl, trackedProps, !isClientOnly, hostRef, slotRef, internalState);
    });

    if (isServer) {
      const jsx = serverRenderVueQrl(vueCmpQrl, props, opts, hostRef, slotRef, isClientOnly);
      return <RenderOnce>{jsx}</RenderOnce>;
    }

    return (
      <>
        <RenderOnce>
          <TagName
            {...getHostProps(props)}
            ref={async (el: Element) => {
              hostRef.value = el;
              if (isBrowser) {
                mountApp(vueCmpQrl, props, false, hostRef, slotRef, internalState);
              }
            }}
          ></TagName>
        </RenderOnce>
        <q-slot style="display: none" ref={slotRef}>
          <Slot />
        </q-slot>
      </>
    );
  });
}

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
