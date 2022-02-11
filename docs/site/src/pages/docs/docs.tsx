import { onRender$, component$, Host, withStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Content } from '../../components/content/content';
import { Footer } from '../../components/footer/footer';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css';

export interface DocsProps {
  doc: string;
}

export const Docs = component$((props: DocsProps) => {
  withStyles$(styles);

  return onRender$(() => (
    <Host class="docs">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <SideBar />
        <Content doc={props.doc} />
        <Footer />
      </main>
    </Host>
  ));
});
