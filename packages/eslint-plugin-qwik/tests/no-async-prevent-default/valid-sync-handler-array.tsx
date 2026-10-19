import { $, sync$ } from '@builder.io/qwik';

export const ValidSyncHandlerArray = () => {
  const log$ = $(() => (document.title = 'key'));
  return (
    <input
      stoppropagation:click
      onKeyDown$={[
        sync$((event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            event.preventDefault();
          }
        }),
        log$,
      ]}
    />
  );
};
