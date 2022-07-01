import { component$, Host, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '~qwik-city-runtime';
import styles from './header.css?inline';

export default component$(
  (props: { fullWidth?: boolean }) => {
    useStyles$(styles);

    const pathname = useLocation().pathname;

    return (
      <Host class={{ 'full-width': !!props.fullWidth }}>
        <section>
          <a href="/">Qwik City 🏙</a>
        </section>
        <nav>
          <a href="/blog" class={{ active: pathname === '/blog' }}>
            Blog
          </a>
          <a href="/docs" class={{ active: pathname === '/docs' }}>
            Docs
          </a>
          <a href="/api" class={{ active: pathname === '/api' }}>
            API
          </a>
          <a href="/about-us" class={{ active: pathname === '/about-us' }}>
            About Us
          </a>
          <a href="/sign-in" class={{ active: pathname === '/sign-in' }}>
            Sign In
          </a>
        </nav>
        {/* <button
          class="theme-toggle"
          onClick$={() => {
            if (themeCtx.theme === 'light') {
              themeCtx.theme = 'dark';
            } else {
              themeCtx.theme = 'light';
            }
          }}
        /> */}
      </Host>
    );
  },
  {
    tagName: 'header',
  }
);
