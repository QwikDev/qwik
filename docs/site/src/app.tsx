import { onRender$, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from './builder';
import { Docs } from './docs';
import styles from './app.css';

interface AppProps {
  pathname: string;
}

export const App = component$(({ pathname }: AppProps) => {
  withStyles$(styles);

  return onRender$(() => {
    if (pathname.startsWith('/docs')) {
      return <Docs pathname={pathname} />;
    }

    return <Builder pathname={pathname} />;
  });
});
