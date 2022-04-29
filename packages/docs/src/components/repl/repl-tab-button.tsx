import { CloseIcon } from '../svgs/close-icon';

export const ReplTabButton = (props: ReplTabButtonProps) => {
  return (
    <div class={{ 'active-tab': props.isActive, 'repl-tab-button': true, ...props.cssClass }}>
      <button class="repl-tab-button-select" onClickQrl={props.onClickQrl}>
        {props.text}
      </button>
      {props.onCloseQrl ? (
        <button class="repl-tab-button-close" onClickQrl={props.onCloseQrl}>
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
}
