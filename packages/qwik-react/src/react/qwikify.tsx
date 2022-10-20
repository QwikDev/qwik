import {
  component$,
  implicit$FirstArg,
  NoSerialize,
  noSerialize,
  QRL,
  useWatch$,
  SkipRender,
  useSignal,
  useOn,
  $,
  Slot,
  useOnDocument,
  RenderOnce,
  useStylesScoped$,
  PropFunction,
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Root } from 'react-dom/client';
import type { FunctionComponent } from 'react';
import * as client from './client';
import { renderFromServer } from './server-render';
import { getHostProps, main } from './slot';

export interface Internal<PROPS> {
  root: Root | undefined;
  cmp: FunctionComponent<PROPS>;
}

export interface QwikifyBase {
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:hover'?: boolean;
  'client:only'?: boolean;
  'client:event'?: string | string[];
  'host:onClick$'?: PropFunction<(ev: Event) => void>;
  'host:onBlur$'?: PropFunction<(ev: Event) => void>;
  'host:onFocus$'?: PropFunction<(ev: Event) => void>;
  'host:onMouseOver$'?: PropFunction<(ev: Event) => void>;
  children?: any;
}

export type TransformProps<PROPS extends {}> = {
  [K in keyof PROPS as TransformKey<K>]: TransformProp<K, PROPS[K]>;
};

export type TransformKey<K extends string | number | symbol> = K extends `on${string}`
  ? `${K}$`
  : K;

export type TransformProp<K extends string | number | symbol, V> = K extends `on${string}`
  ? V extends Function
    ? PropFunction<V>
    : never
  : V;

export type QwikifyProps<PROPS extends {}> = TransformProps<PROPS> & QwikifyBase;

export interface QwikifyOptions {
  tagName?: string;
  eagerness?: 'load' | 'visible' | 'idle' | 'hover';
  event?: string | string[];
  clientOnly?: boolean;
}

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
    const TagName = opts?.tagName ?? ('qwik-react' as any);
    const [signal, isStatic, isClientOnly] = useWakeupSignal(props, opts);

    // Watch takes cares of updates and partial hydration
    useWatch$(async ({ track }) => {
      track(props);
      track(signal);

      if (!isBrowser) {
        return;
      }

      // Update
      if (internalState.value) {
        if (internalState.value.root) {
          internalState.value.root.render(
            main(slotRef.value, scopeId, internalState.value.cmp, props)
          );
        }
      } else {
        let root: Root | undefined = undefined;
        const Cmp = await reactCmp$.resolve();
        const hostElement = hostRef.value;
        if (hostElement) {
          // hydration
          root = client.hydrateRoot(hostElement, main(slotRef.value, scopeId, Cmp, props));
        }
        internalState.value = noSerialize({
          client,
          cmp: Cmp,
          root,
        });
      }
    });

    if (isServer && !isClientOnly) {
      const jsx = renderFromServer(TagName, isStatic, reactCmp$, scopeId, props, hostRef, slotRef);
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
                client.flushSync(() => {
                  const root = (internalData.root = client.createRoot(el));
                  root.render(main(slotRef.value, scopeId, internalData.cmp, props));
                });
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

export const useWakeupSignal = (props: QwikifyProps<{}>, opts: QwikifyOptions = {}) => {
  const signal = useSignal<boolean>();
  const activate = $(() => (signal.value = true));
  const clientOnly = !!(props['client:only'] || opts?.clientOnly);
  let staticRender = true;
  if (isServer) {
    if (props['client:visible'] || opts?.eagerness === 'visible') {
      useOn('qvisible', activate);
      staticRender = false;
    }
    if (props['client:idle'] || opts?.eagerness === 'idle') {
      useOnDocument('qidle', activate);
      staticRender = false;
    }
    if (props['client:load'] || clientOnly || opts?.eagerness === 'load') {
      useOnDocument('qinit', activate);
      staticRender = false;
    }
    if (props['client:hover'] || opts?.eagerness === 'hover') {
      useOn('mouseover', activate);
      staticRender = false;
    }
    if (props['client:event']) {
      useOn(props['client:event'], activate);
      staticRender = false;
    }
    if (opts?.event) {
      useOn(opts?.event, activate);
    }
  }
  return [signal, staticRender, clientOnly] as const;
};

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
