import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import Footer from '../components/footer/footer';
import Header from '../components/header/header';
import styles from '../styles/global.css';

export default component$(() => {
  useStyles$(styles);

  return (
    <Host>
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </Host>
  );
});
