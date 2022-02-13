import { $, component$, Host, withStyles$ } from '@builder.io/qwik';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import styles from './builder.css';

interface BuilderProps {
  pathname: string;
}

export const Builder = component$((props: BuilderProps) => {
  withStyles$(styles);

  return $(() => (
    <Host class="builder">
      <Header />
      <section class="p-4">
        <h1>Qwik</h1>
        <p>Pathname: {props.pathname}</p>
      </section>
      <Footer />
    </Host>
  ));
});
