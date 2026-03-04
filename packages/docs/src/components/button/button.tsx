import { type PropsOf, Slot, component$ } from '@qwik.dev/core';
import { tw } from '~/utils/utils';

const button = {
  base: tw('border-[1.6px] py-2 px-3 flex gap-2 items-center'),
  primary: tw('bg-violet-55 text-white border-violet-65 shadow-primary'),
  secondary: tw('bg-violet-10 border-violet-45 text-violet-75 shadow-secondary'),
};

type ButtonVariant = Exclude<keyof typeof button, 'base'>;

type ButtonProps = PropsOf<'button'> & {
  variant?: ButtonVariant;
};

export const Button = component$<ButtonProps>(({ variant = 'primary', ...props }) => {
  return (
    <button type="button" {...props} class={`${button.base} ${button[variant]}`}>
      <Slot />
    </button>
  );
});
