import { component$ } from '@builder.io/qwik';

export default component$(() => {
  const data = {
    name: 'Qwik',
    description: DESCRIPTION,
  };

  return (
    <>
      <input value={data.name} />
      <br />
      <textarea rows={10} cols={60} value={data.description}></textarea>
    </>
  );
});

export const DESCRIPTION = `
Qwik is designed for the fastest possible page load time,
by delivering pure HTML with near 0 JavaScript for your
pages to become interactive, regardless of how complex
your site or app is. It achieves this via resumability
of code.`;
