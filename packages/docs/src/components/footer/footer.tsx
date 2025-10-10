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
    <footer class="mb-12 mt-10">
      <div class="flex justify-center my-12">
        <div class="flex flex-grow justify-center flex-wrap max-w-screen-xl flex-col sm:flex-row gap-y-4">
          <div class="flex-1 sm:flex-[2] flex sm:justify-center sm:block mb-4 sm:mb-0">
            <QwikLogo width={170} height={54} />
          </div>
          <div class="flex flex-1 sm:flex-[3] max-w-screen-sm flex-wrap gap-y-8 gap-x-20 text-xs sm:px-4">
            <FooterLinks />
          </div>
        </div>
      </div>
      <div class="flex justify-center">
        <div class="max-w-screen-xl w-full">
          <div class="italic text-xs">
            <p>
              Made with <span class="not-italic">❤️</span> by
            </p>
            <p class="text-xl sm:text-2xl">
              The <strong>Qwik</strong> Team
            </p>
          </div>
          <div class="border border-b-0 border-current mt-2"></div>
          <div class="flex justify-between items-end">
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
        <div key={colIndex} class="flex flex-col gap-4 flex-1">
          {column.map((link, linkIndex) => (
            <Link
              key={linkIndex}
              class="text-[color:var(--text-color)] hover:text-interactive-blue z-[10]"
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
    <ul class="flex gap-4 mt-4">
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
