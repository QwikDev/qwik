import { component$, useStore, useStylesScoped$, useVisibleTask$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
import styles from './contributors.css?inline';

// TODO put this in a shared location and remove it on `on-this-page.tsx`
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
  ];

  const urlPathnames = url.split('/').filter((pathname) => pathname !== '');

  if (!(urlPathnames.length >= 2)) {
    urlPathnames.splice(1, 0, '(qwik)');
    return urlPathnames.join('/');
  }

  const qwikDocsPathname = urlPathnames.at(1) as string;

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

export default component$(() => {
  useStylesScoped$(styles);
  const contributors = useStore({ list: [] }, { deep: true });
  const { url } = useLocation();

  useVisibleTask$(
    async () => {
      try {
        const resp = await fetch(
          `https://api.github.com/repos/builderio/qwik/commits?path=packages/docs/src/routes/${makeEditPageUrl(
            url.pathname
          )}/index.mdx`
        );

        const data = await resp.json();

        if (!data) {
          return;
        }

        contributors.list = data
          .map((item) => ({
            id: item.author.id,
            username: item.author.login,
            link: item.author.html_url,
            avatar: item.author.avatar_url,
          }))
          .filter((item, index, self) => self.findIndex((t) => t.id === item.id) === index);
      } catch (e) {
        // mute api errors
      }
    },
    { strategy: 'document-ready' }
  );

  if (!contributors.list.length) {
    return null;
  }

  console.log('xxx', contributors);

  return (
    <div class="wrapper card">
      <p>
        A special <b>thank you</b> to all community members for helping to keep this page
        up-to-date!
      </p>
      <ul class="list">
        {contributors.list.map((contributor: any) => (
          <li key={contributor.id} class="contributor">
            <a href={contributor.link} target="_blank" rel="noreferrer">
              <img src={contributor.avatar} alt={contributor.username} class="avatar" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
