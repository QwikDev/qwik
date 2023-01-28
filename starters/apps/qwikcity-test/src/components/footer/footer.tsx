import { component$, useStyles$, useTask$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';
import { userLoader } from '../../routes/layout';
import { rootLoader } from '../../routes/plugin@header';
import styles from './footer.css?inline';

export default component$(() => {
  const serverData = rootLoader.use();
  const userData = userLoader.use();

  useStyles$(styles);

  useTask$(({ track }) => {
    // run everytime it updates
    track(serverData);
    track(userData);
  });

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
          <Link href="/qwikcity-test/actions/">Actions</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/about-us/">About Us</Link>
        </li>
        <li>
          {userData.value.isAuthenticated ? (
            <Link href="/qwikcity-test/sign-out/">Sign Out</Link>
          ) : (
            <Link href="/qwikcity-test/sign-in/">Sign In</Link>
          )}
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
      <ul>
        <li>{serverData.value.serverTime.toISOString()}</li>
        <li>Node {serverData.value.nodeVersion}</li>
      </ul>
    </footer>
  );
});
