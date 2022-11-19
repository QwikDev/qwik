import * as assert from 'uvu/assert';
import { test } from 'uvu';
import { frontmatterAttrsToDocumentHead, parseFrontmatterAttrs } from './frontmatter';
import type { FrontmatterAttrs } from '../types';

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
  assert.equal(attrs.tags, ['tag1', 'tag2']);
});

test('frontmatter, inline list', async () => {
  const yaml = 'tags: [tag1, tag2]';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.equal(attrs.tags, ['tag1', 'tag2']);
});

test('frontmatter, dictionary', async () => {
  const yaml = 'custom:' + '\n' + '  author: Me';
  const attrs: FrontmatterAttrs = parseFrontmatterAttrs(yaml);
  assert.equal(attrs.custom, { author: 'Me' });
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
  assert.equal(attrs.contributors, ['abc', 'xyz']);
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

test.run();
