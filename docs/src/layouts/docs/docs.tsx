import { $, component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { SideBar } from '../../components/sidebar/sidebar';
import { loadIndex } from '@builder.io/qwest';
import styles from './docs.css';

export interface DocsLayoutProps {
  pathname: string;
}

const DocsLayout = component$((props: DocsLayoutProps) => {
  useScopedStyles$(styles);

  return $(async () => {
    const navIndex = await loadIndex({
      pathname: props.pathname,
    });

    return (
      <Host class="docs">
        <Header />
        <main class="max-w-7xl mx-auto md:px-8 flex">
          {navIndex ? <SideBar navIndex={navIndex} /> : null}
          <section class="flex-1">
            <article class="min-h-[600px] content">
              <Slot />
            </article>
            <Footer />
          </section>
        </main>
      </Host>
    );
  });
});

export default DocsLayout;
