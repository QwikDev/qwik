import { useContent, useLocation } from '@builder.io/qwik-city';
import { component$, useStyles$ } from '@builder.io/qwik';
import { ChatIcon } from '../svgs/chat-icon';
import { GithubLogo } from '../svgs/github-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import styles from './on-this-page.css?inline';
import { EditIcon } from '../svgs/edit-icon';

const makeEditPageUrl = (url: string): string => {
  const qwikDocsPathnames = [
    'advanced',
    'components',
    'concepts',
    'faq',
    'getting-started',
    'think-qwik',
    'docs', // for docs/(qwik)/index.mdx
  ];

  const advancedQwikCityPathnames = [
    'environment-variables',
    'menu',
    'request-handling',
    'routing',
    'speculative-module-fetching',
    'static-assets',
    'sitemaps',
  ];

  const whitelistedDirectories = ['integrations', 'deployments', 'community'];

  const urlPathnames = url.split('/').filter((pathname) => pathname !== '');

  if (!(urlPathnames.length >= 2)) {
    urlPathnames.splice(1, 0, '(qwik)');
    return urlPathnames.join('/');
  }

  const qwikDocsPathname = urlPathnames.at(1) as string;

  if (
    whitelistedDirectories.includes(urlPathnames.at(0) as string) ||
    whitelistedDirectories.includes(qwikDocsPathname)
  ) {
    return urlPathnames.join('/');
  }

  if (qwikDocsPathname.includes('advanced')) {
    // since we advanced named folder in (qwik) and (qwikcity) this will ensure both are not conflicting.
    const advancedDocsPathname = urlPathnames.at(2) as string;
    const isQwikCityPath = advancedQwikCityPathnames.includes(advancedDocsPathname);

    !isQwikCityPath ? urlPathnames.splice(1, 0, '(qwik)') : urlPathnames.splice(1, 0, '(qwikcity)');

    return urlPathnames.join('/');
  }

  const isQwikPath = qwikDocsPathnames.includes(qwikDocsPathname);

  isQwikPath ? urlPathnames.splice(1, 0, '(qwik)') : urlPathnames.splice(1, 0, '(qwikcity)');

  return urlPathnames.join('/');
};

export const OnThisPage = component$(() => {
  useStyles$(styles);

  const { headings } = useContent();
  const contentHeadings = headings?.filter((h) => h.level <= 3) || [];

  const { url } = useLocation();

  const githubEditRoute = makeEditPageUrl(url.pathname);

  const editUrl = `https://github.com/BuilderIO/qwik/edit/main/packages/docs/src/routes/${githubEditRoute}/index.mdx`;

  return (
    <aside class="on-this-page fixed text-sm z-20 bottom-0 right-[max(0px,calc(50%-42rem))] overflow-y-auto hidden xl:block xl:w-[16rem]">
      {contentHeadings.length > 0 ? (
        <>
          <h6>On This Page</h6>
          <ul>
            {contentHeadings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  class={{
                    block: true,
                    indent: h.level > 2,
                  }}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h6>More</h6>
      <ul>
        <li>
          <a href={editUrl} target="_blank">
            <EditIcon width={22} height={22} />
            <span>Edit this page</span>
          </a>
        </li>
        <li>
          <a href="https://github.com/BuilderIO/qwik/issues/new/choose" target="_blank">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="21"
              height="21"
              aria-hidden="true"
              viewBox="0 0 512 512"
            >
              <path
                d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z"
                fill="none"
                stroke="currentColor"
                stroke-miterlimit="10"
                stroke-width="32"
              />
              <path
                d="M250.26 166.05L256 288l5.73-121.95a5.74 5.74 0 00-5.79-6h0a5.74 5.74 0 00-5.68 6z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="32"
              />
              <path d="M256 367.91a20 20 0 1120-20 20 20 0 01-20 20z" fill="currentColor" />
            </svg>
            <span>Create an issue</span>
          </a>
        </li>
        <li>
          <a href="https://qwik.builder.io/chat" target="_blank" rel="nofollow noopener">
            <ChatIcon width={20} height={20} />
            <span>Join our community</span>
          </a>
        </li>
        <li>
          <a href="https://github.com/BuilderIO/qwik" target="_blank" rel="nofollow noopener">
            <GithubLogo width={20} height={20} />
            <span>GitHub</span>
          </a>
        </li>
        <li>
          <a href="https://twitter.com/QwikDev" target="_blank" rel="nofollow noopener">
            <TwitterLogo width={20} height={20} />
            <span>@QwikDev</span>
          </a>
        </li>
      </ul>
    </aside>
  );
});
