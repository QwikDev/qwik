import type { PropsOf, Component } from '@qwik.dev/core';
import { CloseIcon } from '../../components/svgs/close-icon';

export const ReplTabButton: Component<ReplTabButtonProps> = (props) => {
  return (
    <div
      key={props.text}
      class={{ 'active-tab': props.isActive, 'repl-tab-button': true, ...props.cssClass }}
    >
      <button
        class="repl-tab-button-select"
        onClick$={props.onClick$}
        type="button"
        preventdefault:click
      >
        {props.text}
      </button>
      {props.onClose$ && props.enableInputDelete ? (
        <button
          class="repl-tab-button-close"
          onClick$={props.onClose$}
          type="button"
          preventdefault:click
        >
          <CloseIcon width={9} height={9} />
        </button>
      ) : null}
    </div>
  );
};

interface ReplTabButtonProps {
  text: string;
  isActive: boolean;
  onClick$: PropsOf<'button'>['onClick$'];
  onClose$?: PropsOf<'button'>['onClick$'];
  cssClass?: Record<string, boolean>;
  enableInputDelete?: boolean;
}
