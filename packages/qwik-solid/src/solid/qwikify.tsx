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
import type { Component } from 'solid-js';
import { getHostProps, main, mainExactProps, useWakeupSignal } from './slot';
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
      if(internalState.value?.disposeFn) {
        console.log("Will run dispose function")
        internalState.value.disposeFn()
      }

      if (internalState.value && hostRef.value) {
        console.log('Should update with existing internalState.value');
        console.log("Will run render!")
        internalState.value.disposeFn = render(
          () => main(slotRef.value, scopeId, internalState.value!.component, trackedProps),
          hostRef.value
        );
      } else {
        console.log('Should update without existing internalState.value');
        const Cmp = await solidCmp$.resolve();
        const hostElement = hostRef.value;

        console.log("hostElement: ", hostElement?.innerHTML)

        let disposeFn;

        if (hostElement) {
          // hydration
          const solidFn = isClientOnly ? render : hydrate;

          console.log(isClientOnly ? 'Client rendered' : 'Hydrated from server-rendered markup 💦');

          disposeFn = solidFn(() => mainExactProps(slotRef.value, scopeId, Cmp, hydrationKeys), hostElement);

          if (isClientOnly || signal.value === false) {
            disposeFn()
            console.log("Will render")
            disposeFn = render(() => mainExactProps(slotRef.value, scopeId, Cmp, trackedProps), hostElement);
          }
        }

        internalState.value = noSerialize({
          component: Cmp,
          disposeFn
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

                console.log('Rendering on callback');

                render(() => {
                  const slotEl = slotRef.value;

                  // @ts-expect-error
                  return createComponent(Cmp, { children: slotEl });
                }, hostRef.value);
              }
            } else {
              console.log('Setting hostRef by server');
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
