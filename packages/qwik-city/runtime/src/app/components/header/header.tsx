import { component$, Host, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '~qwik-city-runtime';
import styles from './header.css?inline';

export default component$(
  () => {
    useStyles$(styles);

    const pathname = useLocation().pathname;

    return (
      <Host>
        <div class="header-inner">
          <section class="logo">
            <a href="/" data-test-link="header-home">
              Qwik City 🏙
            </a>
          </section>
          <nav data-test-header-links>
            <a
              href="/blog"
              class={{ active: pathname.startsWith('/blog') }}
              data-test-link="blog-home"
            >
              Blog
            </a>
            <a
              href="/docs"
              class={{ active: pathname.startsWith('/docs') }}
              data-test-link="docs-home"
            >
              Docs
            </a>
            <a
              href="/api"
              class={{ active: pathname.startsWith('/api') }}
              data-test-link="api-home"
            >
              API
            </a>
            <a
              href="/products/hat"
              class={{ active: pathname.startsWith('/products') }}
              data-test-link="products-hat"
            >
              Products
            </a>
            <a
              href="/about-us"
              class={{ active: pathname.startsWith('/about-us') }}
              data-test-link="about-us"
            >
              About Us
            </a>
            <a
              href="/sign-in"
              class={{ active: pathname.startsWith('/sign-in') }}
              data-test-link="sign-in"
            >
              Sign In
            </a>
          </nav>
        </div>
      </Host>
    );
  },
  {
    tagName: 'header',
  }
);
