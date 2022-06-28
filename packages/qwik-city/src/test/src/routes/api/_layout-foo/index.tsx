import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import type { HeadComponent } from '@builder.io/qwik-city';
import Footer from '../../../components/footer/footer';
import Header from '../../../components/header/header';
import styles from '../../../styles/global.css';

export default component$(() => {
  useStyles$(styles);

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
