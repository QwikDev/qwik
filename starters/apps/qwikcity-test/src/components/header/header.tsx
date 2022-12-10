import { component$, useStyles$ } from '@builder.io/qwik';
import { Link, useLocation } from '@builder.io/qwik-city';
import styles from './header.css?inline';

export default component$(() => {
  useStyles$(styles);

  const pathname = useLocation().pathname;

  return (
    <header>
      <div class="header-inner">
        <section class="logo">
          <Link href="/qwikcity-test/" prefetch={true} data-test-link="header-home">
            Qwik City 🏙
          </Link>
        </section>
        <nav data-test-header-links>
          <Link
            href="/qwikcity-test/blog/"
            class={{ active: pathname.startsWith('/qwikcity-test/blog/') }}
            data-test-link="blog-home"
          >
            Blog
          </Link>
          <Link
            href="/qwikcity-test/docs/"
            class={{ active: pathname.startsWith('/qwikcity-test/docs/') }}
            data-test-link="docs-home"
          >
            Docs
          </Link>
          <Link
            href="/qwikcity-test/actions/"
            class={{ active: pathname.startsWith('/qwikcity-test/actions/') }}
            data-test-link="docs-home"
          >
            Actions
          </Link>
          <Link
            href="/qwikcity-test/api/"
            class={{ active: pathname.startsWith('/qwikcity-test/api/') }}
            data-test-link="api-home"
          >
            API
          </Link>
          <Link
            href="/qwikcity-test/products/hat/"
            class={{ active: pathname.startsWith('/qwikcity-test/products/') }}
            data-test-link="products-hat"
          >
            Products
          </Link>
          <Link
            href="/qwikcity-test/about-us/"
            class={{ active: pathname.startsWith('/qwikcity-test/about-us/') }}
            data-test-link="about-us"
          >
            About Us
          </Link>
          <Link
            href="/qwikcity-test/sign-in/"
            class={{ active: pathname.startsWith('/qwikcity-test/sign-in/') }}
            data-test-link="sign-in"
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
});
