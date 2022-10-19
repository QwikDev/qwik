import {
  component$,
  implicit$FirstArg,
  NoSerialize,
  noSerialize,
  QRL,
  useWatch$,
  EagernessOptions,
  SkipRender,
  useSignal,
  useOn,
  $,
  SSRStream,
  Slot,
  SSRRaw,
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Root } from 'react-dom/client';
import { FunctionComponent, createElement } from 'react';
import * as client from './client';

export interface Internal<PROPS> {
  root: Root;
  client: typeof import('./client');
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
    const ref = useSignal<Element>();
    const data = useSignal<NoSerialize<Internal<PROPS>>>();
    const activated = useSignal<boolean>();
    const activate = $(() => (activated.value = true));
    const Host = opts?.tagName ?? ('qwik-react' as any);
    const clientOnly = !!(props['client:only'] || opts?.clientOnly);
    let eagerness: EagernessOptions | undefined;
    let staticRender = true;
    if (props['client:visible'] || opts?.eagerness === 'visible') {
      eagerness = 'visible';
      staticRender = false;
    } else if (props['client:idle'] || opts?.eagerness === 'idle') {
      eagerness = 'idle';
      staticRender = false;
    } else if (props['client:load'] || clientOnly || opts?.eagerness === 'load') {
      eagerness = 'load';
      staticRender = false;
    } else if (props['client:hover'] || opts?.eagerness === 'hover') {
      staticRender = false;
      useOn('mouseover', activate);
    }

    if (props['client:event']) {
      useOn(props['client:event'], activate);
      staticRender = false;
    }
    if (opts?.event) {
      useOn(opts?.event, activate);
      staticRender = false;
    }

    useWatch$(
      async ({ track }) => {
        track(props);
        track(activated);

        const hostElement = ref.value;
        if (isBrowser && hostElement) {
          if (data.value) {
            data.value.root.render(createElement(data.value.cmp, clientProps(props) as any));
          } else {
            const Cmp = await reactCmp$.resolve();

            let root: Root;
            if (hostElement.childElementCount > 0) {
              root = client.hydrateRoot(
                hostElement,
                createElement(Cmp, clientProps(props) as any),
                {
                  onRecoverableError() {
                    return false;
                  },
                }
              );
            } else {
              root = client.createRoot(hostElement);
              root.render(createElement(Cmp, clientProps(props) as any));
            }
            data.value = noSerialize({
              client,
              cmp: Cmp,
              root,
            });
          }
        }
      },
      { eagerness }
    );

    if (isServer && !clientOnly) {
      const jsx = Promise.all([reactCmp$.resolve(), import('./server')]).then(([Cmp, server]) => {
        const render = staticRender ? server.renderToStaticMarkup : server.renderToString;
        const html = render(createElement(Cmp, serverProps(props) as any));
        const index = html.indexOf('<!--SLOT-->');
        if (index > 0) {
          const part1 = html.slice(0, index);
          const part2 = html.slice(index + '<!--SLOT-->'.length);
          return (
            <Host ref={ref}>
              <SSRStream>
                {async function* () {
                  yield <SSRRaw data={part1} />;
                  yield <Slot />;
                  yield <SSRRaw data={part2} />;
                }}
              </SSRStream>
            </Host>
          );
        }
        return <Host ref={ref} dangerouslySetInnerHTML={html}></Host>;
      });
      return <>{jsx}</>;
    }

    return <Host ref={ref}>{SkipRender}</Host>;
  });
}

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

export const clientProps = (props: Record<string, any>): Record<string, any> => {
  const obj = filterProps(props);
  obj.children = createElement('q:slot', {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: '' },
  });
  return obj;
};

export const serverProps = (props: Record<string, any>): Record<string, any> => {
  const obj = filterProps(props);
  obj.children = createElement('q:slot', {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: '<!--SLOT-->' },
  });
  return obj;
};

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
