import { $, component$, Host, withStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Content } from '../../components/content/content';
import { Footer } from '../../components/footer/footer';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css';

export interface DocsProps {
  content: string;
}

export const Docs = component$((props: DocsProps) => {
  withStyles$(styles);

  return $(() => (
    <Host class="docs">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <SideBar />
        <Content content={props.content} />
        <Footer />
      </main>
    </Host>
  ));
});
