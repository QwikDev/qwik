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
          <a href="https://github.com/BuilderIO/qwik">Github</a>
        </li>
        <li>
          <a href="https://qwik.builder.io/chat">Chat</a>
        </li>
        <li>
          <a href="/">Home</a>
        </li>
      </ul>
    </footer>
  );
});
