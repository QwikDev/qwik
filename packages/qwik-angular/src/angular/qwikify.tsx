import {
  component$,
  implicit$FirstArg,
  RenderOnce,
  Slot,
  type NoSerialize,
  type QRL,
  useSignal,
  useTask$,
  noSerialize,
  useVisibleTask$,
  useStylesScoped$,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Type } from '@angular/core';
import { ClientRenderer } from './client';
import { getHostProps } from './slot';
import type { Internal, QwikifyOptions, QwikifyProps } from './types';
import { renderFromServer } from './server';
import { useWakeupSignal } from './wake-up-signal';

export function qwikifyQrl<PROPS extends {}>(
  angularCmp$: QRL<Type<unknown>>,
  qwikifyOptions?: QwikifyOptions
) {
  // TODO: check if provided angularCmp$ is a standalone angular component
  return component$<QwikifyProps<PROPS>>((props) => {
    useStylesScoped$(`q-slot:not([projected]){display:none}`);
    const hostRef = useSignal<Element>();
    const slotRef = useSignal<Element>();
    const internalState = useSignal<NoSerialize<Internal>>();
    const [signal, isClientOnly] = useWakeupSignal(props, qwikifyOptions);
    const TagName: any = qwikifyOptions?.tagName ?? 'qwik-angular';

    useVisibleTask$(({ cleanup }) => {
      cleanup(() => internalState.value?.renderer.appRef?.destroy());
    });

    // Watch takes care of updates and partial hydration
    useTask$(async ({ track }) => {
      const trackedProps = track<Record<string, any>>(() => ({ ...props }));
      track(signal);
      if (!isBrowser) {
        return;
      }

      // Update
      if (internalState.value) {
        if (internalState.value.renderer) {
          internalState.value.renderer.setInputProps(trackedProps);
        }
      } else {
        const component = await angularCmp$.resolve();
        const hostElement = hostRef.value;
        const renderer = new ClientRenderer(component, trackedProps);
        if (hostElement) {
          await renderer.render(hostElement, slotRef.value);
        }
        internalState.value = noSerialize({
          renderer,
        });
      }
    });

    if (isServer && !isClientOnly) {
      const jsx = renderFromServer(
        TagName,
        angularCmp$,
        hostRef,
        slotRef,
        props as Record<string, any>
      );
      return <RenderOnce>{jsx}</RenderOnce>;
    }

    return (
      <RenderOnce>
        <TagName
          {...getHostProps(props)}
          ref={(el: Element) => {
            queueMicrotask(async () => {
              // queueMicrotask is needed in order to have "slotRef" defined
              hostRef.value = el;
              if (isBrowser && internalState.value) {
                internalState.value.renderer &&
                  (await internalState.value.renderer.render(el, slotRef.value, props));
              }
            });
          }}
        ></TagName>
        <q-slot ref={slotRef}>
          <Slot></Slot>
        </q-slot>
      </RenderOnce>
    );
  });
}

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
