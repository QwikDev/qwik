import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { simpleicons } from '@qds.dev/ui';

const linkColumns = [
  {
    heading: 'Core',
    links: [
      { title: 'Qwik Core', href: '/docs/' },
      { title: 'Tutorial', href: '/ecosystem/#courses' },
      { title: 'Lifecycle', href: '/docs/components/lifecycle/' },
      { title: 'Events', href: '/docs/components/events/' },
      { title: 'Tasks', href: '/docs/components/tasks/' },
      { title: 'Slots', href: '/docs/components/slots/' },
    ],
  },
  {
    heading: 'Ecosystem',
    links: [
      { title: 'Integrations', href: '/ecosystem/#integrations' },
      { title: 'Cookbooks', href: '/docs/cookbook/' },
    ],
  },
  {
    heading: 'Router',
    links: [
      { title: 'Qwik Router', href: '/docs/qwikrouter/' },
      { title: 'Routing', href: '/docs/qwikrouter/routing/' },
      { title: 'Data Fetching', href: '/docs/qwikrouter/data/' },
      { title: 'Deployments', href: '/ecosystem/#deployments' },
      { title: 'Middleware', href: '/docs/qwikrouter/middleware/' },
      { title: 'API Routes', href: '/docs/qwikrouter/api/' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { title: 'Blog', href: '/blog/' },
      { title: 'Concepts', href: '/docs/concepts/think-qwik/' },
      { title: 'Sandbox', href: '/playground/' },
      { title: 'Qwik Labs', href: '/docs/labs/' },
    ],
  },
];

const socialLinks = [
  { href: 'https://qwik.dev/chat', title: 'Discord', Icon: simpleicons.discord },
  { href: 'https://github.com/QwikDev/qwik', title: 'GitHub', Icon: simpleicons.github },
  { href: 'https://twitter.com/QwikDev', title: 'X', Icon: simpleicons.x },
  { href: 'https://bsky.app/profile/qwik.dev', title: 'Bluesky', Icon: simpleicons.bluesky },
];

export const Footer = component$(() => {
  return (
    <footer class="bg-violet-0 px-6 pt-16 pb-10 sm:px-10 lg:px-20 lg:pt-32">
      <div class="flex flex-col gap-12 max-w-6xl mx-auto lg:gap-20">
        <div class="flex flex-col items-start gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <QwikIconMark class="w-20 h-[86px] shrink-0 lg:w-[100px] lg:h-[107px]" />

          <div class="flex flex-col gap-10 flex-1 lg:gap-16">
            <h2 class="font-heading text-h5 text-foreground-base m-0">
              Automatically instant web apps
            </h2>

            <div class="grid grid-cols-2 gap-x-8 gap-y-10 sm:gap-x-12 lg:grid-cols-4 lg:gap-16 xl:gap-32">
              {linkColumns.map((col) => (
                <div key={col.heading} class="flex flex-col gap-4 min-w-0">
                  <span class="text-label-sm text-foreground-soft">{col.heading}</span>
                  {col.links.map((link) => (
                    <Link
                      key={link.title}
                      href={link.href}
                      class="text-body-sm text-foreground-base no-underline hover:underline"
                    >
                      {link.title}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-body-sm text-foreground-base m-0">
            Copyright &copy; {new Date().getFullYear()} Qwik
          </p>
          <div class="flex gap-6 items-center">
            {socialLinks.map(({ title, href, Icon }) => (
              <a key={title} href={href} target="_blank" rel="noreferrer" title={title}>
                <Icon class="size-6 text-foreground-base" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
});

const QwikIconMark = component$((props: { class?: string }) => {
  return (
    <svg class={props.class} viewBox="0 0 48 53" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M40.973 52.5351L32.0861 43.6985L31.9503 43.7179V43.621L13.0511 24.9595L17.708 20.4637L14.9721 4.76715L1.99103 20.8513C-0.220992 23.0798 -0.628467 26.7036 0.962635 29.3778L9.07337 42.8265C10.3152 44.9 12.566 46.1402 14.9915 46.1208L19.0081 46.082L40.973 52.5351Z"
        fill="#18B6F6"
      />
      <path
        d="M45.8232 20.5411L44.038 17.2468L43.1066 15.5609L42.738 14.902L42.6992 14.9408L37.8094 6.47238C36.587 4.34075 34.2974 3.02301 31.8137 3.04239L27.5255 3.15865L14.7384 3.19741C12.313 3.21679 10.101 4.49577 8.87853 6.56927L1.09766 21.9945L15.0101 4.72831L33.2496 24.7656L30.0091 28.0406L31.9495 43.7178L31.9689 43.679V43.7178H31.9301L31.9689 43.7565L33.4824 45.2293L40.8364 52.4187C41.1469 52.7094 41.6514 52.3606 41.4379 51.9924L36.8975 43.0589L44.8142 28.4282L45.0664 28.1375C45.1634 28.0212 45.2604 27.905 45.3381 27.7887C46.8904 25.6764 47.1038 22.8472 45.8232 20.5411Z"
        fill="#AC7EF4"
      />
      <path
        d="M33.3076 24.6882L15.0099 4.74774L17.61 20.3668L12.9531 24.882L31.9105 43.6985L30.203 28.0794L33.3076 24.6882Z"
        fill="white"
      />
    </svg>
  );
});
