import { component$, Host } from '@builder.io/qwik';
import { Page } from '../page/page';
import { useQwikCity } from '@builder.io/qwik-city';

export const App = component$(() => {
  useQwikCity();

  return (
    <Host>
      <Page />
    </Host>
  );
});
