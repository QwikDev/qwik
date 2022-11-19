import { component$, useStyles$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';
import styles from './footer.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <footer>
      <ul>
        <li>
          <Link href="/qwikcity-test/blog/">Blog</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/docs/">Docs</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/about-us/">About Us</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/sign-in/">Sign In</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/mit/" target="_self" data-test-link="mit">
            {/* Should not use include preventdefault:client */}
            MIT
          </Link>
        </li>
        <li>
          <Link class="footer-home" href="/qwikcity-test/">
            Home
          </Link>
        </li>
      </ul>
    </footer>
  );
});
