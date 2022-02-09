import { onRender$, component$, Host, withStyles$ } from '@builder.io/qwik';
import styles from './docs.css';

interface DocsProps {
  pathname: string;
}

export const Docs = component$(({ pathname }: DocsProps) => {
  withStyles$(styles);

  return onRender$(() => <Host class="docs">Docs! {pathname}</Host>);
});
