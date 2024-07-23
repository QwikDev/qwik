import { frontmatterAttrsToDocumentHead, parseFrontmatterAttrs } from './frontmatter';
import type { FrontmatterAttrs } from '../types';
import { assert, test } from 'vitest';

test('frontmatter, one line', async () => {
  const yaml = 'title: Some Title';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.equal(attrs.title, 'Some Title');
});

test('frontmatter, colons', async () => {
  const yaml = 'title: "Some : Crazy : Title"';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.equal(attrs.title, 'Some : Crazy : Title');
});

test('frontmatter, multiline string', async () => {
  const yaml = 'title: >-' + '\n' + '  Lorem' + '\n' + '  Ipsum';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.equal(attrs.title, 'Lorem Ipsum');
});

test('frontmatter, list', async () => {
  const yaml = 'tags:' + '\n' + '  - tag1' + '\n' + '  - tag2';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.deepEqual(attrs.tags, ['tag1', 'tag2']);
});

test('frontmatter, inline list', async () => {
  const yaml = 'tags: [tag1, tag2]';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.deepEqual(attrs.tags, ['tag1', 'tag2']);
});

test('frontmatter, dictionary', async () => {
  const yaml = 'custom:' + '\n' + '  author: Me';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.deepEqual(attrs.custom, { author: 'Me' });
});

test('frontmatter, multiple', async () => {
  const yaml =
    'title: Some Title' +
    '\n' +
    'description: Some Description' +
    '\n' +
    'contributors:' +
    '\n - abc' +
    '\n - xyz' +
    '\n' +
    'color-scheme: dark';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.equal(attrs.title, 'Some Title');
  assert.equal(attrs.description, 'Some Description');
  assert.deepEqual(attrs.contributors, ['abc', 'xyz']);
  assert.equal(attrs['color-scheme'], 'dark');
});

test('frontmatter, no attrs head', async () => {
  const head = frontmatterAttrsToDocumentHead(undefined);
  assert.equal(head, null);
});

test('frontmatter, attrs head title', async () => {
  const attrs: FrontmatterAttrs = {
    title: 'My Title',
  };
  const head = frontmatterAttrsToDocumentHead(attrs);
  assert.equal(head!.title, 'My Title');
  assert.equal(head!.meta.length, 0);
});

test('frontmatter, attrs head title w/ yaml escaped \\@', async () => {
  const attrs: FrontmatterAttrs = {
    title: '\\@builder.io/qwik',
  };
  const head = frontmatterAttrsToDocumentHead(attrs);
  assert.equal(head!.title, '@builder.io/qwik');
});

const metaNames = [
  'author',
  'creator',
  'color-scheme',
  'description',
  'generator',
  'keywords',
  'publisher',
  'referrer',
  'robots',
  'theme-color',
  'viewport',
];
for (const metaName of metaNames) {
  test(`frontmatter, meta name "${metaName}"`, async () => {
    const attrs: FrontmatterAttrs = {
      [metaName]: `My ${metaName}`,
    };
    const head = frontmatterAttrsToDocumentHead(attrs);
    assert.equal(head!.title, '');
    assert.equal(head!.meta.length, 1);
    assert.equal(head!.meta[0].name, metaName);
    assert.equal(head!.meta[0].content, `My ${metaName}`);
  });
}

test('frontmatter, opengraph proxy', async () => {
  const attrs: FrontmatterAttrs = {
    title: 'My Title',
    description: 'My Description',
    og: {
      title: true,
      description: true,
    },
  };
  const head = frontmatterAttrsToDocumentHead(attrs);
  assert.equal(head!.title, 'My Title');
  assert.equal(head!.meta.length, 3);
  assert.equal(head!.meta[0].name, 'description');
  assert.equal(head!.meta[0].content, 'My Description');
  assert.equal(head!.meta[1].property, 'og:title');
  assert.equal(head!.meta[1].content, 'My Title');
  assert.equal(head!.meta[2].property, 'og:description');
  assert.equal(head!.meta[2].content, 'My Description');
});

test('frontmatter, opengraph proxy override', async () => {
  const attrs: FrontmatterAttrs = {
    title: 'My Title',
    og: {
      title: 'My Another Title',
      description: true,
    },
  };
  const head = frontmatterAttrsToDocumentHead(attrs);
  assert.equal(head!.title, 'My Title');
  assert.equal(head!.meta.length, 1);
  assert.equal(head!.meta[0].property, 'og:title');
  assert.equal(head!.meta[0].content, 'My Another Title');
});

test('frontmatter, opengraph custom property', async () => {
  const attrs: FrontmatterAttrs = {
    title: 'My Title',
    opengraph: [
      {
        image: 'https://example.com/rock.jpg',
        'image:width': 300,
        'image:height': 300,
      },
      {
        image: 'https://example.com/rock2.jpg',
      },
      {
        image: 'https://example.com/rock3.jpg',
        'image:height': 1000,
      },
    ],
  };
  const head = frontmatterAttrsToDocumentHead(attrs);
  assert.equal(head!.title, 'My Title');
  assert.equal(head!.meta.length, 6);
  assert.equal(head!.meta[0].property, 'og:image');
  assert.equal(head!.meta[0].content, 'https://example.com/rock.jpg');
  assert.equal(head!.meta[1].property, 'og:image:width');
  assert.equal(head!.meta[1].content, '300');
  assert.equal(head!.meta[2].property, 'og:image:height');
  assert.equal(head!.meta[2].content, '300');
  assert.equal(head!.meta[3].property, 'og:image');
  assert.equal(head!.meta[3].content, 'https://example.com/rock2.jpg');
  assert.equal(head!.meta[4].property, 'og:image');
  assert.equal(head!.meta[4].content, 'https://example.com/rock3.jpg');
  assert.equal(head!.meta[5].property, 'og:image:height');
  assert.equal(head!.meta[5].content, '1000');
});
