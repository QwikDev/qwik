import { component$, useStyles$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';
import styles from './footer.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <footer>
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
          <Link href="/mit" target="_self" data-test-link="mit">
            {/* Should not use include preventdefault:client */}
            MIT
          </Link>
        </li>
        <li>
          <a class="footer-home" href="/">
            Home
          </a>
        </li>
      </ul>
    </footer>
  );
});
