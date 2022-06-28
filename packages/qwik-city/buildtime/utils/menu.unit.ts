import { join } from 'path';
import * as assert from 'uvu/assert';
import { createMenuFromMarkdown } from '../markdown/menu';
import { suite } from './test-suite';

const test = suite();

test('parse menu.md menu', ({ ctx }) => {
  const filePath = join(ctx.opts.routesDir, 'guide', 'menu.md');
  const readme = `
  # Heading

  ## Section A

  - Text A1
  - [Link A1](/link-a1)

  ## Section B

  - [Link B1](link-b1.mdx)
  - Text B1

  ## [Section C](http://section-c.com)

  `;
  const i = createMenuFromMarkdown(ctx, ctx.opts.routesDir, filePath, readme);
  assert.is(i.pathname, '/guide');
  assert.is(i.text, 'Heading');

  assert.is(i.items![0].text, 'Section A');
  assert.is(i.items![0].items?.length, 2);
  assert.is(i.items![0].items![0].text, 'Text A1');
  assert.is(i.items![0].items![1].text, 'Link A1');
  assert.is(i.items![0].items![1].href, '/link-a1');

  assert.is(i.items![1].text, 'Section B');
  assert.is(i.items![1].items?.length, 2);
  assert.is(i.items![1].items![0].text, 'Link B1');
  assert.is(i.items![1].items![0].href, '/guide/link-b1');
  assert.is(i.items![1].items![1].text, 'Text B1');

  assert.is(i.items![2].text, 'Section C');
  assert.is(i.items![2].href, 'http://section-c.com');
  assert.is(i.items![2].items, undefined);
});

test.run();
