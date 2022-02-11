import { onRender$, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from './pages/builder/builder';
import { Docs } from './pages/docs/docs';
import type { PageProps } from './types';
import styles from './app.css';

export const App = component$((props: PageProps) => {
  withStyles$(styles);

  return onRender$(() => {
    function Router(props: PageProps) {
      if (props.pathname.startsWith('/docs/')) {
        // TODO: Why won't spread operators work here?
        return <Docs doc={props.pathname.slice('/docs/'.length)} />;
      } else {
        return <Builder />;
      }
    }
    return <Router {...props} />;
  });
});
