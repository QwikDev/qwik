import { onRender$, component$, Host } from '@builder.io/qwik';
import { Header } from '../../components/header/header';

export const Builder = component$(() => {
  return onRender$(() => (
    <Host class="builder">
      <Header />
      <h1>Qwik</h1>
      <ul>
        <a href="/docs">Docs</a>
      </ul>
    </Host>
  ));
});
