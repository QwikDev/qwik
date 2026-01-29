import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { BlueskyLogo } from '~/components/svgs/bluesky-logo';
import { DiscordLogo } from '~/components/svgs/discord-logo';
import { GithubLogo } from '~/components/svgs/github-logo';
import { QwikLogo } from '~/components/svgs/qwik-logo';
import { TwitterLogo } from '~/components/svgs/twitter-logo';

const linkColumns = [
  [
    { title: 'Docs', href: `/docs/` },
    { title: 'Qwik Router', href: `/docs/qwikrouter/` },
    { title: 'Ecosystem', href: `/ecosystem/` },
    { title: 'Playground', href: `/playground/` },
  ],
  [
    { title: 'Integrations', href: `/ecosystem/#integrations` },
    { title: 'Deployments', href: `/ecosystem/#deployments` },
    { title: 'Media', href: `/ecosystem/#videos` },
    { title: 'Showcase', href: `/showcase/` },
  ],
  [
    { title: 'Tutorial', href: `/ecosystem/#courses` },
    { title: 'Presentations', href: `/ecosystem/#presentations` },
    { title: 'Community', href: `/ecosystem/#community` },
    { title: 'Press', href: `/press/` },
  ],
];

export const Footer = component$(() => {
  return (
    <footer class="mt-10 mb-12">
      <div class="my-12 flex justify-center">
        <div class="flex max-w-screen-xl flex-grow flex-col flex-wrap justify-center gap-y-4 sm:flex-row">
          <div class="mb-4 flex flex-1 sm:mb-0 sm:block sm:flex-[2] sm:justify-center">
            <QwikLogo width={170} height={54} />
          </div>
          <div class="flex max-w-screen-sm flex-1 flex-wrap gap-x-20 gap-y-8 text-xs sm:flex-[3] sm:px-4">
            <FooterLinks />
          </div>
        </div>
      </div>
      <div class="flex justify-center">
        <div class="w-full max-w-screen-xl">
          <div class="text-xs italic">
            <p>
              Made with <span class="not-italic">❤️</span> by
            </p>
            <p class="text-xl sm:text-2xl">
              The <strong>Qwik</strong> Team
            </p>
          </div>
          <div class="mt-2 border border-b-0 border-current"></div>
          <div class="flex items-end justify-between">
            <p class="text-xs">MIT License © {new Date().getFullYear()}</p>
            <FooterSocialLinks />
          </div>
        </div>
      </div>
    </footer>
  );
});

export const FooterLinks = component$(() => {
  return (
    <>
      {linkColumns.map((column, colIndex) => (
        <div key={colIndex} class="flex flex-1 flex-col gap-4">
          {column.map((link, linkIndex) => (
            <Link
              key={linkIndex}
              class="hover:text-interactive-blue z-[10] text-[color:var(--text-color)]"
              href={link.href}
            >
              {link.title}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
});

export const FooterSocialLinks = component$(() => {
  const socialLinks = [
    { href: 'https://qwik.dev/chat', title: 'Discord', Logo: DiscordLogo },
    { href: 'https://github.com/QwikDev/qwik', title: 'GitHub', Logo: GithubLogo },
    { href: 'https://twitter.com/QwikDev', title: 'Twitter', Logo: TwitterLogo },
    { href: 'https://bsky.app/profile/qwik.dev', title: 'Bluesky', Logo: BlueskyLogo },
  ];

  return (
    <ul class="mt-4 flex gap-4">
      {socialLinks.map(({ title, href, Logo }) => (
        <li key={title} class="list-none">
          <a href={href} target="_blank" title={title}>
            <span>
              <Logo width={22} height={22} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
});
