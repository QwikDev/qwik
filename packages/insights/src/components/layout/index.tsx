import { Slot, component$ } from '@builder.io/qwik';

import Header from '../header';
import styles from './styles.module.css';

type LayoutProps = {
  mode?: 'default' | 'bright';
};

export default component$<LayoutProps>(({ mode = 'default' }) => {
  return (
    <>
      <Header />
      <main class={['section', mode === 'bright' && styles.bright]}>
        <Slot />
      </main>
      {/* <footer>footer</footer> */}
    </>
  );
});
