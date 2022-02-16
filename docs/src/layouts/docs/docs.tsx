import { $, component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css';
import { loadIndex } from '@builder.io/qwest';

export interface DocsLayoutProps {
  pathname: string;
}

const DocsLayout = component$((props: DocsLayoutProps) => {
  useStyles$(styles);

  return $(async () => {
    const navIndex = await loadIndex({
      pathname: props.pathname,
    });

    return (
      <Host class="docs">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          {navIndex ? <SideBar index={navIndex} /> : null}
          <Slot />
          <Footer />
        </main>
      </Host>
    );
  });
});

export default DocsLayout;
