import { $, component$, useContext, useOnDocument, useSignal, useStyles$ } from '@builder.io/qwik';
import { useContent, useLocation } from '@builder.io/qwik-city';
import { GlobalStore } from '../../context';
import { AlertIcon } from '../svgs/alert-icon';
import { ChatIcon } from '../svgs/chat-icon';
import { EditIcon } from '../svgs/edit-icon';
import { GithubLogo } from '../svgs/github-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import styles from './on-this-page.css?inline';

const QWIK_GROUP = [
  'components',
  'concepts',
  'faq',
  'getting-started',
  'index',
  'deprecated-features',
];

const QWIK_ADVANCED_GROUP = [
  'containers',
  'custom-build-dir',
  'dollar',
  'eslint',
  'library',
  'optimizer',
  'modules-prefetching',
  'qrl',
  'qwikloader',
  'vite',
];

const QWIKCITY_GROUP = [
  'action',
  'api',
  'caching',
  'endpoints',
  'error-handling',
  'html-attributes',
  'layout',
  'middleware',
  'pages',
  'project-structure',
  'qwikcity',
  're-exporting-loaders',
  'route-loader',
  'routing',
  'server$',
  'validator',
];

const QWIKCITY_ADVANCED_GROUP = [
  'complex-forms',
  'content-security-policy',
  'menu',
  'plugins',
  'request-handling',
  'routing',
  'sitemaps',
  'speculative-module-fetching',
  'static-assets',
];

const makeEditPageUrl = (url: string): string => {
  const segments = url.split('/').filter((part) => part !== '');
  if (segments[0] !== 'docs') {
    return url;
  }

  let group = '';
  if (segments.length === 1) {
    // Handle root /docs path - it maps to the qwik overview page
    return 'docs/(qwik)';
  }

  if (segments[1] == 'advanced') {
    if (QWIK_ADVANCED_GROUP.includes(segments[2])) {
      group = '(qwik)';
    } else if (QWIKCITY_ADVANCED_GROUP.includes(segments[2])) {
      group = '(qwikcity)';
    }
  } else if (QWIK_GROUP.includes(segments[1])) {
    group = '(qwik)';
  } else if (QWIKCITY_GROUP.includes(segments[1])) {
    group = '(qwikcity)';
  }

  if (group) {
    segments.splice(1, 0, group);
  }

  // Handle special cases for components and concepts which have a different structure
  if (segments.includes('components') || segments.includes('concepts')) {
    // Check if this is a subpage under components or concepts
    const componentIndex = segments.indexOf('components');
    const conceptIndex = segments.indexOf('concepts');
    const index = componentIndex !== -1 ? componentIndex : conceptIndex;

    // If there's a subpage (like components/overview or concepts/resumable)
    if (index !== -1 && index + 1 >= segments.length) {
      // These are directory paths without subpaths, map to their overview pages
      if (componentIndex !== -1) {
        return 'docs/(qwik)/components/overview';
      } else if (conceptIndex !== -1) {
        return 'docs/(qwik)/concepts/think-qwik';
      }
    }
  }

  return segments.join('/');
};

export const OnThisPage = component$(() => {
  useStyles$(styles);
  const theme = useContext(GlobalStore);
  const { headings } = useContent();
  const contentHeadings = headings?.filter((h) => h.level <= 3) || [];

  const { url } = useLocation();

  const githubEditRoute = makeEditPageUrl(url.pathname);

  const editUrl = `https://github.com/QwikDev/qwik/edit/main/packages/docs/src/routes/${githubEditRoute}/index.mdx`;

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

  const useActiveItem = (itemIds: string[]) => {
    const activeId = useSignal<string | null>(null);
    useOnDocument(
      'scroll',
      $(() => {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                activeId.value = entry.target.id;
              }
            });
          },
          { rootMargin: '0% 0% -80% 0%' }
        );

        itemIds.forEach((id) => {
          const element = document.getElementById(id);
          if (element) {
            observer.observe(element);
          }
        });

        return () => {
          itemIds.forEach((id) => {
            const element = document.getElementById(id);
            if (element) {
              observer.unobserve(element);
            }
          });
        };
      })
    );

    return activeId;
  };

  const activeId = useActiveItem(contentHeadings.map((h) => h.id));

  return (
    <aside class="on-this-page text-sm overflow-y-auto hidden xl:block">
      {contentHeadings.length > 0 ? (
        <>
          <h6>On This Page</h6>
          <ul class="px-2 font-medium text-[var(--interactive-text-color)]">
            {contentHeadings.map((h) => (
              <li
                key={h.id}
                class={`${
                  theme.theme === 'light'
                    ? 'hover:bg-[var(--qwik-light-blue)]'
                    : 'hover:bg-[var(--on-this-page-hover-bg-color)]'
                }`}
              >
                {activeId.value === h.id ? (
                  <span class="on-this-page-item">{h.text}</span>
                ) : (
                  <a href={`#${h.id}`} class={`${h.level > 2 ? 'ml-0' : null} on-this-page-item`}>
                    {h.text}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h6>More</h6>
      <ul class="px-2 font-medium text-[var(--interactive-text-color)]">
        {OnThisPageMore.map((el, index) => {
          return (
            <li
              class={`${
                theme.theme === 'light'
                  ? 'hover:bg-[var(--qwik-light-blue)]'
                  : 'hover:bg-[var(--on-this-page-hover-bg-color)]'
              } rounded-lg`}
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
    </aside>
  );
});
