import { component$, Host } from '@builder.io/qwik';
// import { Analytics } from './components/head/analytics';
// import { Seo } from './components/head/seo';
import { routes } from '@qwik-city-app';
import { useQwikCity } from '@builder.io/qwik-city';
import type { QwikCityOptions } from '../../runtime/types';

export const createQwikCity = (opts: QwikCityOptions) => {
  useQwikCity(opts);

  const Content = component$(() => {
    return <Host>fu</Host>;
  });

  return { Content };
};

export const Head = component$(
  () => {
    return (
      <Host>
        <meta name="name" property="fu" />
        <meta name="name2" property="fu2" />
      </Host>
    );
  },
  { tagName: 'head' }
);

export default component$(
  () => {
    const { Content } = createQwikCity({ routes });

    return (
      <Host>
        <Head />
        <body>
          <Content />
        </body>
      </Host>
    );
  },
  { tagName: 'html' }
);
