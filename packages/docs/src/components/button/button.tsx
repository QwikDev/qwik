import { type PropsOf, Slot, component$ } from '@qwik.dev/core';
import { tw } from '~/utils/utils';

const button = {
  base: tw('border-[1.6px] py-2 px-3 flex gap-2 items-center'),
  primary: tw(
    'bg-primary-background-base text-primary-foreground-base border-primary-border-base shadow-primary-base'
  ),
  secondary: tw(
    'bg-secondary-background-base border-secondary-border-base text-secondary-foreground-base shadow-secondary-base'
  ),
};

type ButtonVariant = Exclude<keyof typeof button, 'base'>;

type ButtonProps = PropsOf<'button'> & {
  variant?: ButtonVariant;
};

export const Button = component$<ButtonProps>(
  ({ variant = 'primary', class: className, ...props }) => {
    return (
      <button type="button" {...props} class={`${button.base} ${button[variant]} ${className}`}>
        <Slot />
      </button>
    );
  }
);
