import {
  component$,
  useStore,
  Host,
  noSerialize,
  NoSerialize,
  useScopedStyles$,
  useServerMount$,
  jsx,
  jsxs,
  Fragment,
} from '@builder.io/qwik';
import json from './core.api.json';
import { evaluateSync } from '@mdx-js/mdx';

export interface ApiProps {
  type: 'use-method' | 'rest' | 'advanced';
}

export interface VisibleAPI {
  name: string;
  releaseTag: string;
  canonicalReference: string;
  Vdom: string;
}

export interface ApiStore {
  apis?: NoSerialize<VisibleAPI[]>;
}

export const Api = component$(
  (props: ApiProps) => {
    const store = useStore<ApiStore>({});
    const FILTER = /^\s*\*\s?/gm;

    // useServerMount$(() => {
    const allAPIS = json.members[0].members;
    let filterFn = (_: any) => true;
    if (props.type === 'use-method') {
      filterFn = (member: any) => member.name.startsWith('use') && !member.name.endsWith('Qrl');
    }
    store.apis = noSerialize(
      allAPIS.filter(filterFn).map((api) => {
        const cleanText = api.docComment.replace(FILTER, '').replace('/**', '').slice(1, -2);
        return {
          canonicalReference: api.canonicalReference,
          name: api.name,
          signature: api.releaseTag,
          Vdom: cleanText,
        };
      })
    ) as any;
    // });
    return (
      <Host>
        {store.apis!.map((api) => {
          return (
            <div key={api.canonicalReference}>
              <h2 id={api.canonicalReference}>
                <a aria-hidden="true" tabIndex={-1} href={`#${api.canonicalReference}`}>
                  <span class="icon icon-link"></span>
                </a>
                <code>{api.name}()</code>
              </h2>
              <pre>{api.Vdom}</pre>
            </div>
          );
        })}
      </Host>
    );
  },
  { tagName: 'footer' }
);
