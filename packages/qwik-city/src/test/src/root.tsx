import { component$, Host } from '@builder.io/qwik';
// import { Analytics } from './components/head/analytics';
// import { Common } from './components/head/common';
import { routes } from '@qwik-city-app';
import { Content, useQwikCity } from '@builder.io/qwik-city';

export default component$(
  () => {
    useQwikCity({ routes });

    return (
      <Host>
        {/* <Head>
          <Common />
          <Analytics />
        </Head> */}
        <head></head>
        <body>
          <Content />
        </body>
      </Host>
    );
  },
  { tagName: 'html' }
);
