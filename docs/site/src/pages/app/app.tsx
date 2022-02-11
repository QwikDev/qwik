import { onRender$, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from '../builder/builder';
import { Docs } from '../docs/docs';
import type { PageProps } from '../../types';
import styles from './app.css';

export const App = component$((props: PageProps) => {
  withStyles$(styles);

  return onRender$(() => {
    if (props.pathname.startsWith('/docs')) {
      // TODO: Why won't spread operators work here?
      return <Docs pathname={props.pathname} url={props.url} />;
    }

    return <Builder pathname={props.pathname} />;
  });
});
