import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';

export default component$(() => {
  const imgRef = useSignal<HTMLImageElement>();
  useVisibleTask$(() => {
    imgRef.value!.decode().then(() => {
      alert('loaded and ready!');
    });
  });

  return (
    <section>
      <img ref={imgRef} src="/logos/qwik-logo.svg" height={200} width={200} />
    </section>
  );
});
