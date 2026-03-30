import { component$ } from '@qwik.dev/core';
import { Link, useLocation } from '@qwik.dev/router';
import { lucide, simpleicons } from '@qds.dev/ui';
import { Link as ActionLink } from '../action/action';

type FooterLinkItem = {
  title: string;
  href: string;
  matchHash?: string;
  matchPath?: string;
};

type FooterColumn = {
  heading: string;
  links: FooterLinkItem[];
};

const linkColumns: FooterColumn[] = [
  {
    heading: 'Core',
    links: [
      { title: 'Qwik Core', href: '/docs' },
      { title: 'Tutorial', href: '/tutorial/welcome/overview' },
      {
        title: 'Lifecycle',
        href: '/docs/core/tasks#lifecycle',
        matchHash: '#lifecycle',
      },
      { title: 'Events', href: '/docs/core/events' },
      { title: 'Tasks', href: '/docs/core/tasks' },
      { title: 'Slots', href: '/docs/core/slots' },
    ],
  },
  {
    heading: 'Ecosystem',
    links: [
      { title: 'Integrations', href: '/docs/integrations' },
      { title: 'Cookbooks', href: '/docs/cookbook' },
    ],
  },
  {
    heading: 'Router',
    links: [
      { title: 'Qwik Router', href: '/docs/qwikrouter' },
      { title: 'Routing', href: '/docs/routing' },
      { title: 'Data Fetching', href: '/docs/route-loader' },
      { title: 'Deployments', href: '/docs/deployments' },
      { title: 'Middleware', href: '/docs/middleware' },
      { title: 'API Routes', href: '/docs/endpoints' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { title: 'Blog', href: '/blog' },
      { title: 'Concepts', href: '/docs/concepts/think-qwik' },
      { title: 'Sandbox', href: '/playground' },
      { title: 'Qwik Labs', href: '/docs/labs' },
      { title: 'llms.txt', href: '/llms.txt' },
    ],
  },
];

const socialLinks = [
  { href: 'https://qwik.dev/chat', title: 'Discord', Icon: simpleicons.discord },
  { href: 'https://github.com/QwikDev/qwik', title: 'GitHub', Icon: simpleicons.github },
  { href: 'https://twitter.com/QwikDev', title: 'X', Icon: simpleicons.x },
  { href: 'https://bsky.app/profile/qwik.dev', title: 'Bluesky', Icon: simpleicons.bluesky },
];

const normalizePath = (value: string) => {
  const pathname = value.split('#')[0] || '/';
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
};

const normalizeHash = (value?: string) => {
  if (!value) {
    return '';
  }
  return value.startsWith('#') ? value.toLowerCase() : `#${value.toLowerCase()}`;
};

const isLinkActive = (pathname: string, hash: string, link: FooterLinkItem) => {
  const targetPath = normalizePath(link.matchPath ?? link.href);
  const targetHash = normalizeHash(link.matchHash ?? link.href.split('#')[1]);

  if (pathname !== targetPath) {
    return false;
  }

  if (!targetHash) {
    return true;
  }

  return hash === targetHash;
};

const footerLinkClass = (pathname: string, hash: string, link: FooterLinkItem, mobile = false) => [
  mobile ? 'text-body-md leading-[140%]' : 'text-body-sm leading-[137.5%]',
  'font-semibold no-underline transition-colors',
  isLinkActive(pathname, hash, link)
    ? 'text-standalone-accent'
    : 'text-foreground-base hover:text-standalone-accent',
];

export const Footer = component$(() => {
  const location = useLocation();
  const pathname = normalizePath(location.url.pathname);
  const hash = normalizeHash(location.url.hash);

  return (
    <footer class="bg-violet-0 px-4 pb-6 pt-16 sm:px-6 md:px-8 lg:px-20 lg:pb-10 lg:pt-32">
      <div class="mx-auto flex w-full max-w-[1280px] flex-col gap-16 lg:gap-20">
        <div class="flex flex-col gap-16 lg:hidden">
          <div class="flex flex-col items-start gap-8">
            <QwikIconMark class="h-16 w-[60px] shrink-0" />

            <div class="flex flex-col items-start gap-6">
              <h2 class="m-0 w-full max-w-none text-[20px] leading-[1.26] text-foreground-base">
                <span class="font-heading">Start building </span>
                <span class="font-heading text-sky-45">Qwikly</span>
                <span class="font-heading"> today!</span>
              </h2>

              <ActionLink href="/docs/getting-started" variant="primary" class="text-sm">
                <span>Get Started</span>
                <lucide.arrowright class="size-4" />
              </ActionLink>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-x-12 gap-y-16">
            {linkColumns.map((column) => (
              <div key={column.heading} class="flex min-w-0 flex-col gap-4">
                <span class="text-body-sm leading-[137.5%] text-foreground-muted">
                  {column.heading}
                </span>

                <div class="flex flex-col items-start gap-4">
                  {column.links.map((link) => (
                    <Link
                      key={link.title}
                      href={link.href}
                      class={footerLinkClass(pathname, hash, link, true)}
                    >
                      {link.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div class="hidden items-start gap-[127px] lg:flex">
          <QwikIconMark class="h-[107px] w-[101px] shrink-0" />

          <div class="flex max-w-[825px] flex-1 flex-col gap-16">
            <h2 class="m-0 font-heading text-h5 text-foreground-base">
              Automatically instant web apps
            </h2>

            <div class="grid grid-cols-4 gap-x-16 xl:gap-x-32">
              {linkColumns.map((column) => (
                <div key={column.heading} class="flex min-w-0 flex-col gap-4">
                  <span class="text-label-sm text-foreground-soft">{column.heading}</span>

                  <div class="flex flex-col items-start gap-3">
                    {column.links.map((link) => (
                      <Link
                        key={link.title}
                        href={link.href}
                        class={footerLinkClass(pathname, hash, link)}
                      >
                        {link.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div class="order-1 flex items-center gap-8 lg:order-2">
            {socialLinks.map(({ title, href, Icon }) => (
              <a
                key={title}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={title}
                title={title}
                class="text-foreground-base transition-colors hover:text-standalone-accent"
              >
                <Icon class="size-6" />
              </a>
            ))}
          </div>

          <p class="order-2 m-0 text-body-sm text-foreground-base lg:order-1">
            Copyright &copy; {new Date().getFullYear()} Qwik
          </p>
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
