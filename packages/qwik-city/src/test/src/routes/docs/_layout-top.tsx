import { component$, Host, Slot } from '@builder.io/qwik';
import type { HeadComponent } from '@builder.io/qwik-city';
import Footer from '../../components/footer/footer';
import Header from '../../components/header/header';

export default component$(() => {
  return (
    <Host>
      <Header fullWidth={true} />
      <main class="docs">
        <style
          dangerouslySetInnerHTML={`
        .docs {
          display: grid;
          grid-template-columns: 200px 1fr;
          padding: 0;
        }
        .docs-menu {
          background: #eee;
        }        
        .docs-content {
          padding-left: 20px;
        }
      `}
        />
        <aside class="docs-menu">
          <ul>
            <li>
              <a href="/docs/introduction">Introduction</a>
            </li>
            <li>
              <a href="/docs/getting-started">Getting Started</a>
            </li>
            <li>
              <a href="/docs/components/basics">Components</a>
            </li>
            <li>
              <a href="/">Home</a>
            </li>
          </ul>
        </aside>
        <section class="docs-content">
          <Slot />
        </section>
      </main>
      <Footer />
    </Host>
  );
});

export const head: HeadComponent = ({ location }) => {
  return (
    <>
      <title>Docs: {location.pathname}</title>
    </>
  );
};
