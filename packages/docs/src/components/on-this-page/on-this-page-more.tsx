import { component$ } from '@qwik.dev/core';
import { EditIcon } from '../svgs/edit-icon';
import { AlertIcon } from '../svgs/alert-icon';
import { ChatIcon } from '../svgs/chat-icon';
import { GithubLogo } from '../svgs/github-logo';
import { TwitterLogo } from '../svgs/twitter-logo';

type OnThisPageMoreProps = {
  editUrl: string;
};

export const OnThisPageMore = component$<OnThisPageMoreProps>(({ editUrl }) => {
  const OnThisPageMore = [
    {
      href: editUrl,
      text: 'Edit this Page',
      icon: EditIcon,
    },
    {
      href: 'https://github.com/QwikDev/qwik/issues/new/choose',
      text: 'Create an issue',
      icon: AlertIcon,
    },
    {
      href: 'https://qwik.dev/chat',
      text: 'Join our community',
      icon: ChatIcon,
    },
    {
      href: 'https://github.com/QwikDev/qwik',
      text: 'GitHub',
      icon: GithubLogo,
    },
    {
      href: 'https://twitter.com/QwikDev',
      text: '@QwikDev',
      icon: TwitterLogo,
    },
  ];
  return (
    <>
      <h6>More</h6>
      <ul class="px-2 font-medium text-[var(--interactive-text-color)]">
        {OnThisPageMore.map((el, index) => {
          return (
            <li
              class="hover:bg-(--on-this-page-hover-bg-color) rounded-lg"
              key={`more-items-on-this-page-${index}`}
            >
              <a class="more-item" href={el.href} rel="noopener" target="_blank">
                <el.icon width={20} height={20} />
                <span>{el.text}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
});
