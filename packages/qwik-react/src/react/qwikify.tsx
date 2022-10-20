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
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Root } from 'react-dom/client';
import { FunctionComponent, createElement } from 'react';
import * as client from './client';
import { renderFromServer } from './server-render';
import { main } from './slot';

export interface Internal<PROPS> {
  root: Root | undefined;
  cmp: FunctionComponent<PROPS>;
}

export type QwikifyProps<PROPS extends {}> = PROPS & {
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:hover'?: boolean;
  'client:only'?: boolean;
  'client:event'?: string | string[];
};

export interface QwikifyOptions {
  tagName?: string;
  eagerness?: 'load' | 'visible' | 'idle' | 'hover';
  event?: string | string[];
  clientOnly?: boolean;
}

export function qwikifyQrl<PROPS extends {}>(
  reactCmp$: QRL<FunctionComponent<PROPS>>,
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
        <q-slot ref={slotRef}>
          <Slot></Slot>
        </q-slot>
        <TagName
          ref={(el: Element) => {
            const internalData = internalState.value;
            if (internalData && !internalData.root) {
              client.flushSync(() => {
                const root = (internalData.root = client.createRoot(el));
                root.render(main(slotRef.value, scopeId, internalData.cmp, props));
              });
            }
          }}
        >
          {SkipRender}
        </TagName>
      </RenderOnce>
    );
  });
}

export const useWakeupSignal = (props: QwikifyProps<{}>, opts: QwikifyOptions = {}) => {
  const signal = useSignal<boolean>();
  const activate = $(() => (signal.value = true));
  const clientOnly = !!(props['client:only'] || opts?.clientOnly);
  let staticRender = true;

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
  return [signal, staticRender, clientOnly] as const;
};

export const filterProps = (props: Record<string, any>): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith('client:')) {
      obj[key] = props[key];
    }
  });
  obj.children = createElement('p');
  return obj;
};

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
