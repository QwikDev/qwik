import { component$, useStyles$ } from '@builder.io/qwik';
import { Link } from '~qwik-city-runtime';
import styles from './footer.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <footer>
      <ul>
        <li>
          <Link href="/blog">Blog</Link>
        </li>
        <li>
          <Link href="/docs">Docs</Link>
        </li>
        <li>
          <Link href="/about-us">About Us</Link>
        </li>
        <li>
          <Link href="/sign-in">Sign In</Link>
        </li>
        <li>
          <Link href="/mit" target="_self" data-test-link="mit">
            {/* Should not use include preventdefault:client */}
            MIT
          </Link>
        </li>
        <li>
          <Link class="footer-home" href="/">
            Home
          </Link>
        </li>
      </ul>
    </footer>
  );
});
