import { component$, Host } from '@builder.io/qwik';
import { Page } from '../page/page';
// import { createQwikCity } from '@builder.io/qwik-city';

export const App = component$(() => {
  return (
    <Host>
      <Page />
    </Host>
  );
});
