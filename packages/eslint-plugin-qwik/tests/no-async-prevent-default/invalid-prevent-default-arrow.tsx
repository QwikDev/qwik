// Expect error: { "messageId": "noAsyncPreventDefault" }
import { $ } from '@builder.io/qwik';

export const InvalidPreventDefaultArrow = () => {
  const handleSubmit = $((event: SubmitEvent) => {
    event.preventDefault();
  });
  return (
    <form onSubmit$={handleSubmit}>
      <button type="submit">Hello World</button>
    </form>
  );
};
