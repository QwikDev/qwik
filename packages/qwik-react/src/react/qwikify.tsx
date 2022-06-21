import {
  component$,
  Host,
  implicit$FirstArg,
  NoSerialize,
  noSerialize,
  QRL,
  SkipRerender,
  useHostElement,
  useWatch$,
  useStore,
  UseEffectRunOptions,
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Root } from 'react-dom/client';
import type { FunctionComponent } from 'react';

export interface Internal<PROPS> {
  root: Root;
  client: typeof import('./client');
  cmp: FunctionComponent<PROPS>;
}

export interface QwikifyCmp<PROPS extends {}> {
  data?: NoSerialize<Internal<PROPS>>;
  event?: NoSerialize<any>;
}

export type QwikifyProps<PROPS extends {}> = PROPS & {
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:only'?: boolean;
};

export function qwikifyQrl<PROPS extends {}>(reactCmpQrl: QRL<FunctionComponent<PROPS>>) {
  return component$<QwikifyProps<PROPS>>(
    (props) => {
      const hostElement = useHostElement();
      const store = useStore<QwikifyCmp<PROPS>>({});
      let run: UseEffectRunOptions | undefined;
      if (props['client:visible']) {
        run = 'visible';
      } else if (props['client:load'] || props['client:only']) {
        run = 'load';
      }

      useWatch$(
        async (track) => {
          track(props);

          if (isBrowser) {
            if (store.data) {
              store.data.root.render(store.data.client.Main(store.data.cmp, filterProps(props)));
            } else {
              const [Cmp, client] = await Promise.all([reactCmpQrl.resolve(), import('./client')]);

              let root: Root;
              if (hostElement.childElementCount > 0) {
                root = client.hydrateRoot(
                  hostElement,
                  client.Main(Cmp, filterProps(props), store.event)
                );
              } else {
                root = client.createRoot(hostElement);
                root.render(client.Main(Cmp, filterProps(props)));
              }
              store.data = noSerialize({
                client,
                cmp: Cmp,
                root,
              });
            }
          }
        },
        { run }
      );

      if (isServer && !props['client:only']) {
        const jsx = Promise.all([reactCmpQrl.resolve(), import('./server')]).then(
          ([Cmp, server]) => {
            const html = server.render(Cmp, filterProps(props));
            return <Host dangerouslySetInnerHTML={html}></Host>;
          }
        );
        return <>{jsx}</>;
      }

      return (
        <Host>
          <SkipRerender />
        </Host>
      );
    },
    {
      tagName: 'qwik-wrap',
    }
  );
}

export const filterProps = (props: Record<string, any>): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith('client:')) {
      obj[key] = props[key];
    }
  });
  return obj;
};

export const qwikify$ = implicit$FirstArg(qwikifyQrl);
