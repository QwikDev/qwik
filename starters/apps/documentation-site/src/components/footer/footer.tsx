import { component$, useStyles$ } from '@builder.io/qwik';
import styles from './footer.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <footer>
      <ul>
        <li>
          <a href="/docs">Docs</a>
        </li>
        <li>
          <a href="/about-us">About Us</a>
        </li>
        <li>
          <a href="https://qwik.builder.io/">Qwik</a>
        </li>
        <li>
          <a href="https://twitter.com/QwikDev">Twitter</a>
        </li>
        <li>
          <a href="https://github.com/BuilderIO/qwik">GitHub</a>
        </li>
        <li>
          <a href="https://qwik.builder.io/chat">Chat</a>
        </li>
      </ul>
      <div>
        <a href="https://www.builder.io/" target="_blank" class="builder">
          Made with ♡ by Builder.io
        </a>
      </div>
    </footer>
  );
});
