import { component$, Host, Slot } from '@builder.io/qwik';
// import { useQwikCity } from '@builder.io/qwik-city';
// import { Analytics } from './components/head/analytics';
// import { Seo } from './components/head/seo';
// import { routes } from '@qwik-city-app';

const Html = component$(
  () => {
    return (
      <Host>
        <Slot />
      </Host>
    );
  },
  { tagName: 'html' }
);

export default () => {
  return (
    <>
      <Html>
        <head></head>
        <body>fu</body>
      </Html>
    </>
  );
};
