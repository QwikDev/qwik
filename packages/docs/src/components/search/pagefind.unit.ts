import { assert, test } from 'vitest';
import {
  groupSearchResults,
  normalizePagefindResults,
  normalizeSearchHref,
  type PagefindSearchData,
} from './pagefind';

test('normalizeSearchHref trims trailing slash and keeps hashes', () => {
  assert.equal(
    normalizeSearchHref('/docs/getting-started/#installation'),
    '/docs/getting-started#installation'
  );
  assert.equal(normalizeSearchHref('https://qwik.dev/api/qwik/'), '/api/qwik');
});

test('groupSearchResults treats the api index route as api', () => {
  const grouped = groupSearchResults(
    normalizePagefindResults([
      {
        url: '/api',
        meta: { title: 'API Reference' },
      },
      {
        url: '/docs/core/events',
        meta: { title: 'Events' },
      },
    ])
  );

  assert.deepEqual(grouped, [
    {
      title: 'Docs',
      items: [
        {
          title: 'Events',
          subtitle: '/docs/core/events',
          href: '/docs/core/events',
          excerpt: '',
          group: 'Docs',
        },
      ],
    },
    {
      title: 'API',
      items: [
        {
          title: 'API Reference',
          subtitle: '/api',
          href: '/api',
          excerpt: '',
          group: 'API',
        },
      ],
    },
  ]);
});

test('groupSearchResults promotes exact title matches ignoring casing', () => {
  const grouped = groupSearchResults(
    normalizePagefindResults([
      {
        url: '/docs/cookbook/view-transition/#css',
        meta: { title: 'CSS' },
        excerpt: 'Listen to the view transition event',
      },
      {
        url: '/docs/core/events/#events',
        meta: { title: 'Events' },
        excerpt: 'Events. For a web application to be interactive',
      },
      {
        url: '/docs/guides/bundle/#runtime-analytics',
        meta: { title: 'Runtime analytics' },
        excerpt: 'Open the events panel',
      },
    ]),
    'events'
  );

  assert.deepEqual(
    grouped[0]?.items.map((item) => item.title),
    ['Events', 'CSS', 'Runtime analytics']
  );
});

test('groupSearchResults promotes partial title matches before excerpt-only matches', () => {
  const grouped = groupSearchResults(
    normalizePagefindResults([
      {
        url: '/docs/getting-started-qwikly',
        meta: { title: 'Getting started qwikly' },
        excerpt: 'A quick introduction',
      },
      {
        url: '/docs/cookbook/view-transition/#css',
        meta: { title: 'CSS' },
        excerpt: 'Getting started patterns for transitions',
      },
      {
        url: '/docs/tutorial/overview',
        meta: { title: 'Tutorial overview' },
        excerpt: 'A getting started path',
      },
      {
        url: '/docs/misc/getting-started-notes',
        meta: { title: 'Notes about getting started' },
        excerpt: 'Collected notes',
      },
    ]),
    'getting started'
  );

  assert.deepEqual(
    grouped[0]?.items.map((item) => item.title),
    ['Getting started qwikly', 'CSS', 'Tutorial overview', 'Notes about getting started']
  );
});

test('normalizePagefindResults prefers sub results when available', () => {
  const items: PagefindSearchData[] = [
    {
      url: '/docs/getting-started/',
      excerpt: 'Page level excerpt',
      meta: {
        title: 'Getting Started',
      },
      sub_results: [
        {
          title: 'Installation',
          url: '/docs/getting-started/#installation',
          excerpt: 'Install with <mark>pnpm</mark> create',
        },
      ],
    },
  ];

  assert.deepEqual(normalizePagefindResults(items), [
    {
      title: 'Installation',
      subtitle: '/docs/getting-started#installation',
      href: '/docs/getting-started#installation',
      excerpt: 'Install with <mark>pnpm</mark> create',
      group: 'Docs',
    },
  ]);
});

test('groupSearchResults keeps docs before api while preserving intra-group order', () => {
  const grouped = groupSearchResults(
    normalizePagefindResults([
      {
        url: '/api/qwik-router/',
        meta: { title: 'Qwik Router API' },
      },
      {
        url: '/docs/getting-started/',
        meta: { title: 'Getting Started' },
      },
      {
        url: '/api/qwik/',
        meta: { title: 'Qwik API' },
      },
      {
        url: '/docs/routing/',
        meta: { title: 'Routing' },
      },
    ])
  );

  assert.deepEqual(grouped, [
    {
      title: 'Docs',
      items: [
        {
          title: 'Getting Started',
          subtitle: '/docs/getting-started',
          href: '/docs/getting-started',
          excerpt: '',
          group: 'Docs',
        },
        {
          title: 'Routing',
          subtitle: '/docs/routing',
          href: '/docs/routing',
          excerpt: '',
          group: 'Docs',
        },
      ],
    },
    {
      title: 'API',
      items: [
        {
          title: 'Qwik Router API',
          subtitle: '/api/qwik-router',
          href: '/api/qwik-router',
          excerpt: '',
          group: 'API',
        },
        {
          title: 'Qwik API',
          subtitle: '/api/qwik',
          href: '/api/qwik',
          excerpt: '',
          group: 'API',
        },
      ],
    },
  ]);
});
