import { Slot, component$ } from '@builder.io/qwik';

import Header from '../header';

type LayoutProps = {
  mode?: 'default' | 'bright';
  class?: string;
};

export default component$<LayoutProps>(({ mode = 'default', ...props }) => {
  return (
    <>
      <Header />
      <main class={[mode === 'bright' ? 'bg-white' : 'bg-slate-100', props.class]}>
        <Slot />
      </main>
      {/* <footer>footer</footer> */}
    </>
  );
});
