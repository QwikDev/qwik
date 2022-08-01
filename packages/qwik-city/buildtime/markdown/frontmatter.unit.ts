import * as assert from 'uvu/assert';
import { test } from 'uvu';
import { frontmatterAttrsToDocumentHead, parseFrontmatterAttrs } from './frontmatter';
import type { FrontmatterAttrs } from '../types';

test('frontmatter, one line', async () => {
  const attrs: FrontmatterAttrs = {};
  const yaml = `title: Some Title`;
  parseFrontmatterAttrs(attrs, yaml);
  assert.equal(attrs.title, 'Some Title');
});

test('frontmatter, colons', async () => {
  const attrs: FrontmatterAttrs = {};
  const yaml = `title: Some : Crazy : Title`;
  parseFrontmatterAttrs(attrs, yaml);
  assert.equal(attrs.title, 'Some : Crazy : Title');
});

test('frontmatter, multiline', async () => {
  const attrs: FrontmatterAttrs = {};
  const yaml = `
  title: Some Title
  description: Some Description`;
  parseFrontmatterAttrs(attrs, yaml);
  assert.equal(attrs.title, 'Some Title');
  assert.equal(attrs.description, 'Some Description');
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

test('frontmatter, attrs head description', async () => {
  const attrs: FrontmatterAttrs = {
    description: 'My Description',
  };
  const head = frontmatterAttrsToDocumentHead(attrs);
  assert.equal(head!.title, '');
  assert.equal(head!.meta.length, 1);
  assert.equal(head!.meta[0].name, 'description');
  assert.equal(head!.meta[0].content, 'My Description');
});

test.run();
