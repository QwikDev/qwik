import { onRender$, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from './builder';
import { Docs } from './docs';
import styles from './app.css';
import { PageProps } from './types';

export const App = component$((props: PageProps) => {
  withStyles$(styles);

  return onRender$(() => {
    if (props.pathname.startsWith('/docs')) {
      // TODO: Why won't spread operators work here?
      return <Docs {...props} />;
    }

    return <Builder pathname={props.pathname} />;
  });
});
