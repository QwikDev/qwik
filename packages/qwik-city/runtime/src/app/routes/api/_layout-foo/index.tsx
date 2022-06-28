import { component$, Host, Slot } from '@builder.io/qwik';
import type { HeadComponent } from 'packages/qwik-city/runtime';
import Footer from '../../../components/footer/footer';
import Header from '../../../components/header/header';

export default component$(() => {
  return (
    <Host>
      <Header fullWidth={true} />
      <main class="api">
        <aside class="api-menu">
          <ul>
            <li>
              <a href="/api">API</a>
            </li>
          </ul>
        </aside>
        <section class="api-content">
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
      <title>API: {location.pathname}</title>
    </>
  );
};
