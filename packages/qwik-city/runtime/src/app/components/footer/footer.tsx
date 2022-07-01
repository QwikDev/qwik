import { component$, Host, useStyles$ } from '@builder.io/qwik';
import styles from './footer.css?inline';

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
            <a href="/sign-in">Sign In</a>
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
