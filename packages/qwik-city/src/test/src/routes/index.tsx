import { component$, Host } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host>
      <h1>Welcome to QwikCity Test App!?</h1>

      <ul>
        <li>
          <a href="/blog">Blog</a>
        </li>
        <li>
          <a href="/docs">Docs</a>
        </li>
        <li>
          <a href="/about-us">About Us</a>
        </li>
      </ul>
    </Host>
  );
});
