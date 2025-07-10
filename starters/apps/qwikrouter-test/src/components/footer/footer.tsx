import { component$, useStyles$, useTask$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { useUserLoader } from "../../routes/layout";
import { useRootLoader } from "../../routes/plugin@header";
import { usePlugin } from "../../routes/plugin@issue4722";
import styles from "./footer.css?inline";

export default component$(() => {
  const serverData = useRootLoader();
  const userData = useUserLoader();
  const plugin = usePlugin();

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
          <Link href="/qwikrouter-test/blog/">Blog</Link>
        </li>
        <li>
          <Link href="/qwikrouter-test/docs/">Docs</Link>
        </li>
        <li>
          <Link href="/qwikrouter-test/actions/">Actions</Link>
        </li>
        <li>
          <Link href="/qwikrouter-test/about-us/">About Us</Link>
        </li>
        <li>
          {userData.value.isAuthenticated ? (
            <Link href="/qwikrouter-test/sign-out/">Sign Out</Link>
          ) : (
            <Link href="/qwikrouter-test/sign-in/">Sign In</Link>
          )}
        </li>
        <li>
          <Link
            href="/qwikrouter-test/mit/"
            target="_self"
            data-test-link="mit"
          >
            {/* Should not use include preventdefault:client */}
            MIT
          </Link>
        </li>
        <li>
          <Link class="footer-home" href="/qwikrouter-test/">
            Home
          </Link>
        </li>
        <li>
          <Link href="/qwikrouter-test/layout-only/inner/">Layout Only</Link>
        </li>
      </ul>
      <ul>
        <li>{serverData.value.serverTime.toISOString()}</li>
        <li>Node {serverData.value.nodeVersion}</li>
        <li>{plugin.value.message}</li>
      </ul>
    </footer>
  );
});
