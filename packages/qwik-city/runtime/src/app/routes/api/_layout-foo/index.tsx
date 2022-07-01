import { component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import type { HeadComponent } from '~qwik-city-runtime';
import Footer from '../../../components/footer/footer';
import Header from '../../../components/header/header';
import styles from './api.css?inline';

export default component$(() => {
  useScopedStyles$(styles);

  return (
    <Host>
      <Header fullWidth={true} />
      <main class="api">
        <aside class="api-menu">
          <h2>API</h2>
          <ul>
            <li>
              <a href="/api/builder.io/oss.json">Org/User</a>
            </li>
            <li>
              <a href="/api/data.json">Data</a>
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
