import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './not-found.css?inline';

const NotFound = component$(() => {
  useScopedStyles$(styles);

  return (
    <Host class="docs">
      <Header />
      <SideBar />
      <main>Not Found</main>
    </Host>
  );
});

export default NotFound;
