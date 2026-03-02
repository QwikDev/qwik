// Expect error: { "messageId": "noAsyncPreventDefault" }
import { $ } from '@builder.io/qwik';

export const NoAsyncPreventDefault = () => {
  return (
    <form
      onSubmit$={$((event: SubmitEvent) => {
        event.preventDefault();
      })}
    >
      <button type="submit">Hello World</button>
    </form>
  );
};
