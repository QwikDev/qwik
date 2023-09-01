import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
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
            href="/qwikcity-test/"
            prefetch={true}
            data-test-link="header-home"
          >
            Qwik City 🏙
          </Link>
        </section>
        <nav data-test-header-links>
          <Link
            href="/qwikcity-test/blog/"
            class={{
              active: loc.url.pathname.startsWith("/qwikcity-test/blog/"),
            }}
            data-test-link="blog-home"
          >
            Blog
          </Link>
          <Link
            href="/qwikcity-test/docs/"
            class={{
              active: loc.url.pathname.startsWith("/qwikcity-test/docs/"),
            }}
            data-test-link="docs-home"
          >
            Docs
          </Link>
          <Link
            href="/qwikcity-test/actions/"
            class={{
              active: loc.url.pathname.startsWith("/qwikcity-test/actions/"),
            }}
            data-test-link="docs-actions"
          >
            Actions
          </Link>
          <Link
            href="/qwikcity-test/api/"
            class={{
              active: loc.url.pathname.startsWith("/qwikcity-test/api/"),
            }}
            data-test-link="api-home"
          >
            API
          </Link>
          <Link
            href="/qwikcity-test/products/hat/"
            class={{
              active: loc.url.pathname.startsWith("/qwikcity-test/products/"),
            }}
            data-test-link="products-hat"
          >
            Products
          </Link>
          <Link
            href="/qwikcity-test/about-us/"
            class={{
              active: loc.url.pathname.startsWith("/qwikcity-test/about-us/"),
            }}
            data-test-link="about-us"
          >
            About Us
          </Link>

          {userData.value.isAuthenticated ? (
            <Link href="/qwikcity-test/sign-in/" data-test-link="sign-in">
              Dashboard
            </Link>
          ) : (
            <Link
              href="/qwikcity-test/sign-in/"
              class={{
                active: loc.url.pathname.startsWith("/qwikcity-test/sign-in/"),
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
