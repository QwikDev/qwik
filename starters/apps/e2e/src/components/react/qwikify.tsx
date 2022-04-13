import {
  $,
  component$,
  Host,
  implicit$FirstArg,
  NoSerialize,
  noSerialize,
  QRL,
  SkipRerender,
  useHostElement,
  useStore,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import type { Root } from 'react-dom/client';
import type { FunctionComponent } from 'react';

export interface QwikifyCmp<PROPS extends {}> {
  root: NoSerialize<Root>;
  react: NoSerialize<any>;
  cmp: NoSerialize<FunctionComponent<PROPS>>;
  c: boolean;
}

interface QwikifyOptions {
  mode: 'none' | 'visible' | 'load' | 'scroll';
  events: string[];
}

export function qwikifyQrl<PROPS extends {}>(
  qrl: QRL<FunctionComponent<PROPS>>,
  options: QwikifyOptions
) {
  return component$<PROPS>(
    async (props) => {
      const store = useStore<QwikifyCmp<PROPS>>({
        root: undefined,
        react: undefined,
        cmp: undefined,
        c: false,
      });

      const hydrate = $(() => {
        store.c = true;
      });

      const attributes: Record<string, any> = {};
      options.events.forEach((ev) => {
        attributes[`on-${ev}Qrl`] = hydrate;
      });
      if (options.mode === 'load') {
        attributes[`onDocument-loadQrl`] = hydrate;
      } else if (options.mode === 'scroll') {
        attributes[`onDocument-scrollQrl`] = hydrate;
      } else if (options.mode === 'visible') {
        const load = $(() => {
          const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
              store.c = true;
            }
          });
          obs.observe(useHostElement());
        });
        attributes[`onDocument-loadQrl`] = load;
      }

      if (isServer) {
        const [Cmp, react, reactDom] = await Promise.all([
          qrl.resolve(useHostElement()),
          import('react'),
          import('react-dom/server'),
        ]);
        const html = reactDom.renderToString(react.createElement(Cmp, { ...props }));
        return (
          <Host style={{ display: 'contents' }} innerHTML={html}>
            <SkipRerender />
          </Host>
        );
      }

      if (isBrowser) {
        if (store.root) {
          store.root.render(store.react!.createElement(store.cmp, { ...props }));
        } else {
          const [Cmp, react, reactDom] = await Promise.all([
            qrl.resolve(useHostElement()),
            import('react'),
            import('react-dom/client'),
          ]);
          const root = reactDom.hydrateRoot(
            useHostElement(),
            react.createElement(Cmp, { ...props })
          );
          store.root = noSerialize(root);
          store.react = noSerialize(react);
          store.cmp = noSerialize(Cmp);
        }
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

export const qwikify$ = implicit$FirstArg(qwikifyQrl);
