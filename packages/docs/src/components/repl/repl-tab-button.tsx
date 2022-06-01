import { CloseIcon } from '../svgs/close-icon';

export const ReplTabButton = (props: ReplTabButtonProps) => {
  return (
    <div
      key={props.text}
      class={{ 'active-tab': props.isActive, 'repl-tab-button': true, ...props.cssClass }}
    >
      <button
        class="repl-tab-button-select"
        onClickQrl={props.onClickQrl}
        type="button"
        preventDefault:click
      >
        {props.text}
      </button>
      {props.onCloseQrl && props.enableInputDelete ? (
        <button
          class="repl-tab-button-close"
          onClickQrl={props.onCloseQrl}
          type="button"
          preventDefault:click
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
  onClick$: () => void;
  onClickQrl?: any;
  onClose$?: () => void;
  onCloseQrl?: any;
  cssClass?: Record<string, boolean>;
  enableInputDelete?: boolean;
}
