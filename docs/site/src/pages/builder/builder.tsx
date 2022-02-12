import { onRender$, component$, Host, withStyles$ } from '@builder.io/qwik';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import styles from './builder.css';

export const Builder = component$(() => {
  withStyles$(styles);

  return onRender$(() => (
    <Host class="builder">
      <Header />
      <section class="p-4">
        <h1>Qwik</h1>
      </section>
      <Footer />
    </Host>
  ));
});
