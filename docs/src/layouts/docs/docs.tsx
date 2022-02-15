import { $, component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css';
import { getNavItems } from '@builder.io/qwest';

export interface DocsProps {
  pathname: string;
}

const Docs = component$(() => {
  useStyles$(styles);

  return $(async () => {
    const navItems = await getNavItems({
      category: 'docs',
    });

    return (
      <Host class="docs">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <SideBar items={navItems} />
          <Slot />
          <Footer />
        </main>
      </Host>
    );
  });
});

export default Docs;
