import {
  $,
  component$,
  Host,
  implicit$FirstArg,
  NoSerialize,
  noSerialize,
  QRL,
  SkipRerender,
  untrack,
  useWatchEffect$,
  useHostElement,
  useStore,
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
  c: boolean;
  event?: NoSerialize<any>;
}

export const getSlot = (react: any) => {
  return react.createElement('q:slot');
};

export type QwikifyProps<PROPS extends {}> = PROPS & {
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:only'?: boolean;
  'client:scroll'?: boolean;
};

export function qwikifyQrl<PROPS extends {}>(qrl: QRL<FunctionComponent<PROPS>>) {
  return component$<QwikifyProps<PROPS>>(
    async (props) => {
      const untrackedProps = untrack(props);

      const hostElement = useHostElement();
      const store = useStore<QwikifyCmp<PROPS>>({
        c: false,
      });

      const hydrate = $(() => {
        store.c = true;
      });

      const attributes: Record<string, any> = {};
      if (untrackedProps['client:load'] || untrackedProps['client:only']) {
        attributes[`onDocument-loadQrl`] = hydrate;
      }
      if (untrackedProps['client:scroll']) {
        attributes[`onDocument-scrollQrl`] = hydrate;
      }
      if (untrackedProps['client:visible']) {
        attributes[`on-qVisibleQrl`] = hydrate;
      }

      useWatchEffect$(async (track) => {
        track(store, 'c');
        track(props);

        const hostElement = useHostElement();

        if (isBrowser) {
          if (store.data) {
            store.data.root.render(store.data.client.Main(store.data.cmp, { ...props }));
          } else {
            const [Cmp, client] = await Promise.all([qrl.resolve(hostElement), import('./client')]);

            let root: Root;
            if (hostElement.childElementCount > 0) {
              root = client.hydrateRoot(hostElement, client.Main(Cmp, { ...props }, store.event));
            } else {
              root = client.createRoot(hostElement);
              root.render(client.Main(Cmp, { ...props }));
            }
            store.data = noSerialize({
              client,
              cmp: Cmp,
              root,
            });
          }
        }
      });

      if (isServer && !untrackedProps['client:only']) {
        const [Cmp, server] = await Promise.all([qrl.resolve(hostElement), import('./server')]);
        const html = server.render(Cmp, { ...untrackedProps });
        return (
          <Host {...attributes} innerHTML={html}>
            <SkipRerender />
          </Host>
        );
      }

      return (
        <Host {...attributes}>
          <SkipRerender />
        </Host>
      );
    },
    {
      tagName: 'qwik-wrap',
    }
  );
}

export const qwikify$ = implicit$FirstArg(qwikifyQrl);
