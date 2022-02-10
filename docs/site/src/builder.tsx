import { onRender$, component$, Host } from '@builder.io/qwik';

interface BuilderProps {
  pathname: string;
}

export const Builder = component$(({ pathname }: BuilderProps) => {
  return onRender$(() => (
    <Host class="builder">
      <p>Builder! {pathname}</p>
      <ul>
        <a href="/docs">Docs</a>
        <a href="/">Homepage</a>
      </ul>
    </Host>
  ));
});
