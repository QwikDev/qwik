import { component$, $ } from '@builder.io/qwik';

export const Footer = component$(() => {
  // setup

  return $(() => (
    // render
    <>
      <hr />
      <p style={{ 'text-align': 'center' }}>
        Made with ❤️ by{' '}
        <a target="_blank" href="https://www.builder.io/">
          Builder.io
        </a>
      </p>
    </>
  ));
});
