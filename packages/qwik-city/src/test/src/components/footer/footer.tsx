import { component$, Host, useStyles$ } from '@builder.io/qwik';
import { useRoute } from '@builder.io/qwik-city';
import styles from './footer.css';

export default component$(
  () => {
    useStyles$(styles);

    const pathname = useRoute().pathname;

    return (
      <Host>
        <a href="/blog" class={{ active: pathname === '/blog' }}>
          Blog
        </a>
        <a href="/docs" class={{ active: pathname === '/docs' }}>
          Docs
        </a>
        <a href="/about-us" class={{ active: pathname === '/about-us' }}>
          About Us
        </a>
        <a href="/" class={{ active: pathname === '/' }}>
          Homepage
        </a>
      </Host>
    );
  },
  {
    tagName: 'footer',
  }
);
