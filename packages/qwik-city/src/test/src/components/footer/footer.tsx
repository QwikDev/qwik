import { component$, Host } from '@builder.io/qwik';
import { useRoute } from '@builder.io/qwik-city';

export default component$(
  () => {
    const pathname = useRoute().pathname;

    return (
      <Host>
        <hr />

        <ul>
          <li>
            <a href="/blog" class={{ active: pathname === '/blog' }}>
              Blog
            </a>
          </li>
          <li>
            <a href="/docs" class={{ active: pathname === '/docs' }}>
              Docs
            </a>
          </li>
          <li>
            <a href="/about-us" class={{ active: pathname === '/about-us' }}>
              About Us
            </a>
          </li>
          <li>
            <a href="/" class={{ active: pathname === '/' }}>
              Home
            </a>
          </li>
        </ul>
      </Host>
    );
  },
  {
    tagName: 'footer',
  }
);
