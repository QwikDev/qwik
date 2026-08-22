import { type QwikIntrinsicElements, Slot, component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

type ButtonTheme =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'info'
  | 'github'
  | 'text';

type ButtonProps = QwikIntrinsicElements['button'] & { theme?: ButtonTheme };
type ButtonLinkProps = QwikIntrinsicElements['a'] & { theme?: ButtonTheme };
type ButtonClass = QwikIntrinsicElements['button']['class'];

const getButtonClasses = (theme: ButtonTheme, className?: ButtonClass) => [
  'button gap-editorial-3 px-editorial-6 py-editorial-3 text-editorial-14 leading-[1.2] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent disabled:cursor-not-allowed disabled:opacity-50',
  theme === 'primary' &&
    'rounded-editorial-sm bg-editorial-accent text-editorial-on-accent hover:bg-editorial-navy',
  theme === 'secondary' &&
    'min-h-12 rounded-editorial-md border border-editorial-border-strong bg-editorial-surface text-editorial-primary hover:bg-editorial-subtle',
  theme === 'github' &&
    'min-h-12 rounded-editorial-md border border-editorial-primary bg-editorial-primary text-editorial-on-accent hover:bg-editorial-navy',
  theme === 'danger' &&
    'min-h-12 rounded-editorial-md border border-editorial-danger bg-editorial-danger text-editorial-on-accent',
  theme === 'success' &&
    'min-h-12 rounded-editorial-md border border-editorial-success bg-editorial-success text-editorial-on-accent',
  theme === 'warning' &&
    'min-h-12 rounded-editorial-md border border-editorial-warning bg-editorial-warning text-editorial-primary',
  theme === 'info' &&
    'min-h-12 rounded-editorial-md border border-editorial-accent bg-editorial-accent text-editorial-on-accent',
  theme === 'text' &&
    'rounded-editorial-sm !px-0 !py-0 text-editorial-link hover:text-editorial-primary',
  className,
];

export default component$<ButtonProps>((props) => {
  const { class: className, theme = 'secondary', ...buttonProps } = props;

  return (
    <button type="button" {...buttonProps} class={getButtonClasses(theme, className)}>
      <Slot />
    </button>
  );
});

export const ButtonLink = component$<ButtonLinkProps>((props) => {
  const { class: className, theme = 'secondary', ...linkProps } = props;

  return (
    <Link {...linkProps} class={getButtonClasses(theme, className)}>
      <Slot />
    </Link>
  );
});
