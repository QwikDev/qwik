import { $, component$, Host, withStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css';
import { getNavItems, getPage } from '@quest';

export interface DocsProps {
  pathname: string;
}

const Docs = component$((props: DocsProps) => {
  withStyles$(styles);

  return $(async () => {
    const navItems = await getNavItems({
      category: 'docs',
    });

    const page = await getPage({
      pathname: props.pathname,
    });
    const Content = await page!.getContent();

    return (
      <Host class="docs">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <SideBar items={navItems} />
          <Content />
          <Footer />
        </main>
      </Host>
    );
  });
});

export default Docs;
