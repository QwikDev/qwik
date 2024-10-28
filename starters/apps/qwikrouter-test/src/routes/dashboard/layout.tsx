import { component$, Slot, useStyles$ } from "@qwik.dev/core";
import type { DocumentHead, RequestHandler } from "@qwik.dev/router";
import { isUserAuthenticated } from "../../auth/auth";
import Footer from "../../components/footer/footer";
import Header from "../../components/header/header";
import styles from "./dashboard.css?inline";

export const onGet: RequestHandler = async ({
  cacheControl,
  redirect,
  cookie,
}) => {
  const isAuthenticated = await isUserAuthenticated(cookie);
  if (!isAuthenticated) {
    throw redirect(302, "/qwikrouter-test/sign-in");
  }
  cacheControl({
    noCache: true,
    private: true,
  });
};

export default component$(() => {
  useStyles$(styles);

  return (
    <div data-test-layout="dashboard">
      <Header />
      <main class="dashboard">
        <aside class="dashboard-menu">
          <h5>Dashboard Menu</h5>
          <ul>
            <li>
              <a
                href="/qwikrouter-test/dashboard/profile"
                data-test-link="dashboard-profile"
              >
                Profile
              </a>
            </li>
            <li>
              <a
                href="/qwikrouter-test/dashboard/settings"
                data-test-link="dashboard-settings"
              >
                Settings
              </a>
            </li>
            <li>
              <a
                href="/qwikrouter-test/sign-out"
                data-test-link="dashboard-sign-out"
              >
                Sign Out
              </a>
            </li>
          </ul>
        </aside>
        <section class="dashboard-content">
          <Slot />
        </section>
      </main>
      <Footer />
    </div>
  );
});

export const head: DocumentHead = ({ head }) => {
  return {
    title: `Dashboard ${head.title}`,
  };
};
