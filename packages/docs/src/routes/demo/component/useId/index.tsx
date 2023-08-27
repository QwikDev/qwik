import { component$, useId, useSignal, useVisibleTask$ } from '@builder.io/qwik';

export default component$(() => {
  const elemIdSignal = useSignal<string | null>(null);
  const id = useId();
  const elemId = `${id}-example`;
  console.log('server-side id:', elemId);

  useVisibleTask$(() => {
    const elem = document.getElementById(elemId);
    elemIdSignal.value = elem?.getAttribute('id') || null;
  });

  return (
    <section>
      <div id={elemId}>
        Both server-side and client-side console should match this id:
        <br />
        <b>{elemIdSignal.value || null}</b>
      </div>
    </section>
  );
});