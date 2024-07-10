import { component$ } from '@builder.io/qwik';

type AvatarProps = {
  src: string;
  alt: string;
  size?: 'small' | 'medium' | 'large';
};

/**
 * Todos:
 *
 * - Implement sizes
 * - Add a link to open the menu
 */

export default component$<AvatarProps>((props) => {
  return (
    <img
      src={props.src}
      alt={props.alt}
      class="overflow-hidden rounded-full border border-slate-300 leading-[0px]"
      width="40"
      height="40"
    />
  );
});
