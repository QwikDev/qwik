import { component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const currentTarget = useSignal<HTMLElement|null>(null);
  const target = useSignal<HTMLElement|null>(null);
  
  return (
    <div onClick$={(event, _currentTarget) => {
      currentTarget.value = _currentTarget;
      target.value = event.target as HTMLElement;
    }}>
      Click on any text <code>target</code> and <code>currentTarget</code> of the event.
      <hr/>
      <span>Hello <b>World</b>!</span>
      <hr/>
      <ul>
        <li>currentTarget: {currentTarget.value?.tagName}</li>
        <li>target: {target.value?.tagName}</li>
      </ul>
    </div>
  );
});
