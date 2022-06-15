import { component$, Host, useStyles$ } from '@builder.io/qwik';
import { useRoute } from '@builder.io/qwik-city';
import styles from './header.css';

export default component$(
  () => {
    useStyles$(styles);

    const pathname = useRoute().pathname;

    return (
      <Host>
        <section>
          <a href="/">QwikCity 🏙</a>
        </section>
        <nav>
          <a href="/blog" class={{ active: pathname === '/blog' }}>
            Blog
          </a>
          <a href="/docs" class={{ active: pathname === '/docs' }}>
            Docs
          </a>
          <a href="/about-us" class={{ active: pathname === '/about-us' }}>
            About Us
          </a>
        </nav>
      </Host>
    );
  },
  {
    tagName: 'header',
  }
);
