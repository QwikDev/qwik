import { component$, useSignal, sync$, $ } from '@builder.io/qwik';

export default component$(() => {
  const shouldPreventDefault = useSignal(true);
  return (
    <div>
      <div>Sync Event:</div>
      <input
        type="checkbox"
        checked={shouldPreventDefault.value}
        onChange$={(e, target) =>
          (shouldPreventDefault.value = target.checked)
        }
      />{' '}
      Should Prevent Default
      <hr />
      <a
        href="https://google.com"
        target="_blank"
        data-should-prevent-default={shouldPreventDefault.value}
        onClick$={[
          sync$((e: MouseEvent, target: HTMLAnchorElement) => {
            if (target.hasAttribute('data-should-prevent-default')) {
              e.preventDefault();
            }
          }),
          $(() => {
            console.log(
              shouldPreventDefault.value ? 'Prevented' : 'Not Prevented'
            );
          }),
        ]}
      >
        open Google
      </a>
    </div>
  );
});
