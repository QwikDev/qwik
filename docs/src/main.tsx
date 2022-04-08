import { component$, Host, useStore, useStyles$ } from '@builder.io/qwik';
import styles from './global.css';
import { Page } from './components/page/page';

export interface SiteStore {
  headerMenuOpen: boolean;
  sideMenuOpen: boolean;
}

export const Main = component$(() => {
  useStyles$(styles);

  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
  });

  return (
    <Host
      class={{
        'header-open': store.headerMenuOpen,
        'menu-open': store.sideMenuOpen,
      }}
    >
      <Page store={store} />
    </Host>
  );
});
