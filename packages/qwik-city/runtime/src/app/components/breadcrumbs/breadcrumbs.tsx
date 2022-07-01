import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import { useContentBreadcrumbs } from '~qwik-city-runtime';
import styles from './breadcrumbs.css?inline';

export const Breadcrumbs = component$(
  () => {
    useScopedStyles$(styles);

    const breadcrumbs = useContentBreadcrumbs();

    return (
      <Host class="breadcrumbs">
        {breadcrumbs
          ? breadcrumbs.map((b) => <span>{b.href ? <a href={b.href}>{b.text}</a> : b.text}</span>)
          : null}
      </Host>
    );
  },
  { tagName: 'nav' }
);
