import { component$ } from '@qwik.dev/core';
import { lucide } from '@qds.dev/ui';
import { GithubLogo } from '../svgs/github-logo';
import { TwitterLogo } from '../svgs/twitter-logo';

type OnThisPageMoreProps = {
  editUrl: string;
};

export const OnThisPageMore = component$<OnThisPageMoreProps>(({ editUrl }) => {
  return (
    <div class="more-section">
      <h6 class="on-this-page-more-heading">More</h6>
      <a class="more-item" href={editUrl} rel="noopener" target="_blank">
        <lucide.pencil class="size-4" />
        <span>Edit this page</span>
      </a>
      <a
        class="more-item"
        href="https://github.com/QwikDev/qwik/issues/new/choose"
        rel="noopener"
        target="_blank"
      >
        <lucide.circlealert class="size-4" />
        <span>Create an issue</span>
      </a>
      <a class="more-item" href="https://qwik.dev/chat" rel="noopener" target="_blank">
        <lucide.messagesquare class="size-4" />
        <span>Join our community</span>
      </a>
      <a class="more-item" href="https://github.com/QwikDev/qwik" rel="noopener" target="_blank">
        <GithubLogo width={20} height={20} />
        <span>GitHub</span>
      </a>
      <a class="more-item" href="https://twitter.com/QwikDev" rel="noopener" target="_blank">
        <TwitterLogo width={20} height={20} />
        <span>@QwikDev</span>
      </a>
    </div>
  );
});
