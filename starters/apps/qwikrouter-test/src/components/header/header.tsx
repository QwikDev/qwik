import { component$, useStyles$ } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { useUserLoader } from "../../routes/layout";
import styles from "./header.css?inline";

export default component$(() => {
  const userData = useUserLoader();
  const loc = useLocation();

  useStyles$(styles);

  return (
    <header>
      <div class="header-inner">
        <section class="logo">
          <Link
            href="/qwikrouter-test/"
            prefetch={true}
            data-test-link="header-home"
          >
            Qwik Router 🛣
          </Link>
        </section>
        <nav data-test-header-links>
          <Link
            href="/qwikrouter-test/blog/"
            class={{
              active: loc.url.pathname.startsWith("/qwikrouter-test/blog/"),
            }}
            data-test-link="blog-home"
          >
            Blog
          </Link>
          <Link
            href="/qwikrouter-test/docs/"
            class={{
              active: loc.url.pathname.startsWith("/qwikrouter-test/docs/"),
            }}
            data-test-link="docs-home"
          >
            Docs
          </Link>
          <Link
            href="/qwikrouter-test/actions/"
            class={{
              active: loc.url.pathname.startsWith("/qwikrouter-test/actions/"),
            }}
            data-test-link="docs-actions"
          >
            Actions
          </Link>
          <Link
            href="/qwikrouter-test/api/"
            class={{
              active: loc.url.pathname.startsWith("/qwikrouter-test/api/"),
            }}
            data-test-link="api-home"
          >
            API
          </Link>
          <Link
            href="/qwikrouter-test/products/hat/"
            class={{
              active: loc.url.pathname.startsWith("/qwikrouter-test/products/"),
            }}
            data-test-link="products-hat"
          >
            Products
          </Link>
          <Link
            href="/qwikrouter-test/about-us/"
            class={{
              active: loc.url.pathname.startsWith("/qwikrouter-test/about-us/"),
            }}
            data-test-link="about-us"
          >
            About Us
          </Link>

          {userData.value.isAuthenticated ? (
            <Link href="/qwikrouter-test/sign-in/" data-test-link="sign-in">
              Dashboard
            </Link>
          ) : (
            <Link
              href="/qwikrouter-test/sign-in/"
              class={{
                active: loc.url.pathname.startsWith(
                  "/qwikrouter-test/sign-in/",
                ),
              }}
              data-test-link="sign-out"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
});
