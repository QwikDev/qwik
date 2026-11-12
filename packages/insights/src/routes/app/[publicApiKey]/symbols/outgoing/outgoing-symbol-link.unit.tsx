import { expect, test } from 'vitest';
import { domRender } from '@qwik.dev/core/testing';
import { OutgoingSymbolLink } from './outgoing-symbol-link';

test('keeps outgoing exploration in one encoded symbol link', async () => {
  const { document } = await domRender(
    <OutgoingSymbolLink publicApiKey="demo" symbol="symbol&next=#part" />
  );
  const links = document.querySelectorAll('a');
  expect(links).toHaveLength(1);
  expect(links[0].querySelector('a')).toBeFalsy();
  expect(links[0].textContent).toContain('symbol&next=#part');
  expect(links[0].getAttribute('href')).toBe(
    '/app/demo/symbols/outgoing/?symbol=symbol%26next%3D%23part'
  );
});
