// Expect error: { "messageId": "noAsyncPreventDefault" }
// Expect error: { "messageId": "noAsyncPreventDefault" }
import { $ } from '@builder.io/qwik';

export const InvalidWrappedHandler = (props: { allowPaste: boolean }) => {
  const log$ = $(() => (document.title = 'key'));
  return (
    <input
      onPaste$={props.allowPaste ? undefined : (event: ClipboardEvent) => event.preventDefault()}
      onKeyDown$={[(event: KeyboardEvent) => event.preventDefault(), log$]}
    />
  );
};
