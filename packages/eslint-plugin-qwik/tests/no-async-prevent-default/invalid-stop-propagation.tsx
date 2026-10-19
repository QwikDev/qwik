// Expect error: { "messageId": "noAsyncStopPropagation" }
import { $ } from '@builder.io/qwik';

export const InvalidStopPropagation = () => {
  const handleClick = $((event: MouseEvent) => {
    event.stopPropagation();
  });
  return (
    <div onClick$={() => (document.title = 'card')}>
      <button onClick$={handleClick}>Hello World</button>
    </div>
  );
};
