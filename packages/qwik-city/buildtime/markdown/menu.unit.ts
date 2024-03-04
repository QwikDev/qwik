import { join } from 'node:path';
import { createMenu, parseMenu } from './menu';
import { suite, assert } from '../../utils/test-suite';

const test = suite();

test('parse menu.md menu', ({ ctx: { opts } }) => {
  const filePath = join(opts.routesDir, 'guide', 'menu.md');
  const content = `
  # Heading

  ## Section A

  - Text A1
  - [Link A1](/link-a1)

  ## Section B

  - [Link B1](link-b1/index.mdx)
  - Text B1

  ## [Section C](http://section-c.com)

  `;
  const menu = createMenu(opts, filePath);
  assert.equal(menu.pathname, '/guide/');

  const i = parseMenu(opts, filePath, content, false);
  assert.equal(i.text, 'Heading');

  assert.equal(i.items![0].text, 'Section A');
  assert.equal(i.items![0].items?.length, 2);
  assert.equal(i.items![0].items![0].text, 'Text A1');
  assert.equal(i.items![0].items![1].text, 'Link A1');
  assert.equal(i.items![0].items![1].href, '/link-a1/');

  assert.equal(i.items![1].text, 'Section B');
  assert.equal(i.items![1].items?.length, 2);
  assert.equal(i.items![1].items![0].text, 'Link B1');
  assert.equal(i.items![1].items![0].href, '/guide/link-b1/');
  assert.equal(i.items![1].items![1].text, 'Text B1');

  assert.equal(i.items![2].text, 'Section C');
  assert.equal(i.items![2].href, 'http://section-c.com');
  assert.equal(i.items![2].items, undefined);
});
