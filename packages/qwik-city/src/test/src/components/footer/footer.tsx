import { component$, Host, useStyles$ } from '@builder.io/qwik';
import styles from './footer.css';

export default component$(
  () => {
    useStyles$(styles);

    return (
      <Host>
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
          <li>
            <a href="/">Home</a>
          </li>
        </ul>
      </Host>
    );
  },
  {
    tagName: 'footer',
  }
);
