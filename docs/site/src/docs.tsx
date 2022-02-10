import { onRender$, component$, Host, withStyles$ } from '@builder.io/qwik';
import styles from './docs.css';
import { Header } from './header';
import { PageProps } from './types';

export const Docs = component$((props: PageProps) => {
  withStyles$(styles);

  return onRender$(() => (
    <Host class="docs">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <h1>Docs! {props.pathname}</h1>
        <p>content content content</p>
        <p>content content content</p>
        <p>content content content</p>
        <p>content content content</p>
      </main>
    </Host>
  ));
});
