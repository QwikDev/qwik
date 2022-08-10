import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import Footer from '../../components/footer/footer';
import Header from '../../components/header/header';
import styles from './dashboard.css?inline';

/**
 * `layout!` means this is the top level layout. Because of the
 * `!` at the end of the filename, it stops at this layout and does
 * not keep crawling up the directories making more nested layouts.
 */

export default component$(() => {
  useStyles$(styles);

  return (
    <div>
      <Header />
      <main class="dashboard">
        <aside class="dashboard-menu">
          <h5>Dashboard Menu</h5>
          <ul>
            <li>
              <a href="/dashboard/profile">Profile</a>
            </li>
            <li>
              <a href="/dashboard/settings">Settings</a>
            </li>
          </ul>
        </aside>
        <section class="dashboard-content">
          <Slot />
        </section>
      </main>
      <Footer />
    </div>
  );
});

export const head: DocumentHead = ({ head }) => {
  return {
    title: `Dashboard ${head.title}`,
  };
};
