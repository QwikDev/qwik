import { Slot, component$ } from '@builder.io/qwik';

import Header from '../header';
import styles from './styles.module.css';

type LayoutProps = {
  mode?: 'default' | 'bright';
  class?: string;
};

export default component$<LayoutProps>(({ mode = 'default', ...props }) => {
  return (
    <>
      <Header />
      <main class={[mode === 'bright' && styles.bright, props.class]}>
        <Slot />
      </main>
      {/* <footer>footer</footer> */}
    </>
  );
});
