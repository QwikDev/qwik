import { component$, useVisibleTask$, useSignal } from '@qwikdev/core';

export default component$(() => {
  const aHref = useSignal<Element>();
  useVisibleTask$(({ cleanup }) => {
    const handler = (event: Event) => {
      event.preventDefault();
      window.open('http://qwik.dev');
    };
    aHref.value!.addEventListener('click', handler);
    cleanup(() => aHref.value!.removeEventListener('click', handler));
  });

  return (
    <a href="/" ref={aHref}>
      click me!
    </a>
  );
});
