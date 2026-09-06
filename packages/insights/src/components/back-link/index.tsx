import { type QwikIntrinsicElements, Slot, component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

type BackLinkProps = QwikIntrinsicElements['a'];

export default component$<BackLinkProps>((props) => {
  const { class: className, ...linkProps } = props;

  return (
    <Link
      {...linkProps}
      class={[
        'inline-flex items-center rounded-editorial-sm py-editorial-3 text-editorial-14 font-semibold leading-[1.2] text-editorial-link transition-colors hover:text-editorial-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent',
        className,
      ]}
    >
      <Slot />
    </Link>
  );
});
