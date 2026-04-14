import { type PropsOf, Slot, component$ } from '@qwik.dev/core';
import { tw } from '~/utils/utils';

const button = {
  wrapper: tw('relative inline-block'),
  face: tw(
    'border-[1.6px] py-2 px-3 flex gap-2 items-center justify-center relative z-2 w-full cursor-pointer transform hover:-translate-[2px] transition-transform duration-300 text-body-xs'
  ),
  shadow: tw('absolute inset-0 z-1 translate-x-1 translate-y-1 pointer-events-none'),
  primary: tw('bg-primary-background-base text-primary-foreground-base border-primary-border-base'),
  secondary: tw(
    'bg-secondary-background-base border-secondary-border-base text-secondary-foreground-base'
  ),
  outline: tw('bg-background-base border-secondary-border-base text-secondary-foreground-base'),
  primaryShadow: tw('bg-primary-shadow-base'),
  secondaryShadow: tw('bg-secondary-shadow-base'),
  outlineShadow: tw('bg-secondary-shadow-base'),
};

type ButtonVariant = 'primary' | 'secondary' | 'outline';

type ButtonProps = PropsOf<'button'> & {
  variant?: ButtonVariant;
};

type LinkProps = PropsOf<'a'> & {
  variant?: ButtonVariant;
};

const getButtonClasses = (variant: ButtonVariant) => ({
  faceClass: button[variant],
  shadowClass:
    variant === 'primary'
      ? button.primaryShadow
      : variant === 'secondary'
        ? button.secondaryShadow
        : button.outlineShadow,
});

export const Button = component$<ButtonProps>(
  ({ variant = 'primary', class: className, ...props }) => {
    const { faceClass, shadowClass } = getButtonClasses(variant);

    return (
      <div class={[button.wrapper, className]}>
        <button type="button" {...props} class={[button.face, faceClass]}>
          <Slot />
        </button>
        <span class={[button.shadow, shadowClass]} aria-hidden="true" />
      </div>
    );
  }
);

export const Link = component$<LinkProps>(({ variant = 'primary', class: className, ...props }) => {
  const { faceClass, shadowClass } = getButtonClasses(variant);

  return (
    <div class={[button.wrapper, className]}>
      <a {...props} class={[button.face, faceClass]}>
        <Slot />
      </a>
      <span class={[button.shadow, shadowClass]} aria-hidden="true" />
    </div>
  );
});
