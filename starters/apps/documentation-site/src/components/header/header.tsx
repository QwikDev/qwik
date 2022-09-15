import { component$, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
import styles from './header.css?inline';

export default component$(() => {
  useStyles$(styles);

  const pathname = useLocation().pathname;

  return (
    <header>
      <div class="header-inner">
        <section class="logo">
          <a href="/">Qwik City 🏙</a>
        </section>
        <nav>
          <a href="/docs" class={{ active: pathname.startsWith('/docs') }}>
            Docs
          </a>
          <a href="/about-us" class={{ active: pathname.startsWith('/about-us') }}>
            About Us
          </a>
        </nav>
      </div>
    </header>
  );
});
