import { $, component$, useOnDocument, useSignal, useStyles$ } from '@qwik.dev/core';
import { Link, useContent, useLocation } from '@qwik.dev/router';
import styles from './on-this-page.css?inline';
import { OnThisPageMore } from './on-this-page-more';

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

const QWIKROUTER_GROUP = [
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
  'qwikrouter',
  're-exporting-loaders',
  'route-loader',
  'routing',
  'server$',
  'validator',
];

const QWIKROUTER_ADVANCED_GROUP = [
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
    } else if (QWIKROUTER_ADVANCED_GROUP.includes(segments[2])) {
      group = '(qwikrouter)';
    }
  } else if (QWIK_GROUP.includes(segments[1])) {
    group = '(qwik)';
  } else if (QWIKROUTER_GROUP.includes(segments[1])) {
    group = '(qwikrouter)';
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
        return 'docs/(qwik)/core/overview';
      } else if (conceptIndex !== -1) {
        return 'docs/(qwik)/concepts/think-qwik';
      }
    }
  }

  return segments.join('/');
};

export const OnThisPage = component$(() => {
  useStyles$(styles);
  const { headings } = useContent();
  const contentHeadings = headings?.filter((h) => h.level <= 3) || [];

  const { url } = useLocation();
  const githubEditRoute = makeEditPageUrl(url.pathname);
  const editUrl = `https://github.com/QwikDev/qwik/edit/main/packages/docs/src/routes/${githubEditRoute}/index.mdx`;

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
                style={{ paddingLeft: `${(h.level - 2) * 16}px` }}
                class="hover:bg-(--on-this-page-hover-bg-color)"
              >
                {activeId.value === h.id ? (
                  <span class="on-this-page-item">{h.text}</span>
                ) : (
                  <Link href={`#${h.id}`} class={`on-this-page-item`}>
                    {h.text}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <OnThisPageMore editUrl={editUrl} />
        </>
      ) : null}
    </aside>
  );
});
