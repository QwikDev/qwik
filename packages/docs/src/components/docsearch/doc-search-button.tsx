import { component$, useClientEffect$, useStore } from '@builder.io/qwik';
import { ControlKeyIcon } from './icons/ControlKeyIcon';
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
  const ACTION_KEY_DEFAULT = 'Ctrl' as const;
  const ACTION_KEY_APPLE = '⌘' as const;
  const { translations = {} } = props;
  const { buttonText = 'Search', buttonAriaLabel = 'Search' } = translations;
  const store = useStore({
    key: ACTION_KEY_APPLE,
  } as {
    key: typeof ACTION_KEY_APPLE | typeof ACTION_KEY_DEFAULT | null;
  });

  useClientEffect$(() => {
    if (typeof navigator !== 'undefined') {
      isAppleDevice() ? (store.key = ACTION_KEY_APPLE) : (store.key = ACTION_KEY_DEFAULT);
    }
  });
  return (
    <button
      ref={props.ref}
      onClick$={props.onClick$}
      type="button"
      class="DocSearch DocSearch-Button"
      aria-label={buttonAriaLabel}
    >
      <span className="DocSearch-Button-Container">
        <SearchIcon />
        <span className="DocSearch-Button-Placeholder">{buttonText}</span>
      </span>

      <span className="DocSearch-Button-Keys">
        {store.key !== null && (
          <>
            <kbd className="DocSearch-Button-Key">
              {store.key === ACTION_KEY_DEFAULT ? <ControlKeyIcon /> : store.key}
            </kbd>
            <kbd className="DocSearch-Button-Key">K</kbd>
          </>
        )}
      </span>
    </button>
  );
});
