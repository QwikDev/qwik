import { component$, Host, Slot, useScopedStyles$, useStore } from '@builder.io/qwik';
// import Footer from '../../components/footer/footer';
import Header from '../../components/header/header';
import { useContextProvider } from '@builder.io/qwik';
import styles from './index.css';
import { GlobalStore, SiteStore } from '../../utils/context';

export default component$(() => {
  useScopedStyles$(styles);

  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
  });

  useContextProvider(GlobalStore, store);

  return (
    <Host>
      <Header />
      <main>
        <Slot />
      </main>
      {/* <Footer /> */}
    </Host>
  );
});
