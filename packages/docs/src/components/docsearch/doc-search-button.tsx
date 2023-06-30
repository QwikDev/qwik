import { component$ } from '@builder.io/qwik';
import { SearchIcon } from './icons/SearchIcon';

export function isAppleDevice() {
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
}

export type ButtonTranslations = Partial<{
  buttonText: string;
  buttonAriaLabel: string;
}>;

export interface DocSearchButtonProps {
  ref: any;
  translations?: ButtonTranslations;
  onClick$: () => void;
}

export const DocSearchButton = component$((props: DocSearchButtonProps) => {
  // const ACTION_KEY_DEFAULT = 'Ctrl' as const;
  // const ACTION_KEY_APPLE = '⌘' as const;
  // const { translations = {} } = props;
  const { buttonText = 'Search', buttonAriaLabel = 'Search' } = props.translations ?? {};
  return (
    <button
      ref={props.ref}
      onClick$={props.onClick$}
      type="button"
      class="DocSearch DocSearch-Button"
      aria-label={buttonAriaLabel}
    >
      <span class="DocSearch-Button-Container">
        <SearchIcon />
        <span class="DocSearch-Button-Placeholder">{buttonText}</span>
      </span>
    </button>
  );
});
