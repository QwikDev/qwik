import { component$ } from '@qwik.dev/core';
import { _hasStoreEffects, _waitUntilRendered } from '@qwik.dev/core/internal';
import { domRender } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { DocumentHeadTags } from './document-head-tags-component';
import { QwikRouterMockProvider } from './qwik-router-component';
import type { Editable, ResolvedDocumentHead } from './types';
import { useDocumentHead } from './use-functions';

const captured: { head?: Editable<ResolvedDocumentHead> } = {};

const CaptureHead = component$(() => {
  captured.head = useDocumentHead();
  return null;
});

describe('DocumentHeadTags', () => {
  it('re-renders on head changes without a subscription per field', async () => {
    const { document, container } = await domRender(
      <QwikRouterMockProvider>
        <CaptureHead />
        <DocumentHeadTags />
      </QwikRouterMockProvider>
    );
    const head = captured.head!;

    expect(_hasStoreEffects(head, 'title')).toBe(false);
    expect(_hasStoreEffects(head, 'meta')).toBe(false);

    head.title = 'Updated';
    head.meta = [{ name: 'description', content: 'updated' }];
    await _waitUntilRendered(container);

    expect(document.body.querySelector('title')?.textContent).toBe('Updated');
    expect(document.body.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'updated'
    );
  });

  it('renders its props over the document head', async () => {
    const { document } = await domRender(
      <QwikRouterMockProvider>
        <DocumentHeadTags title="Override" meta={[{ name: 'description', content: 'desc' }]} />
      </QwikRouterMockProvider>
    );

    expect(document.body.querySelector('title')?.textContent).toBe('Override');
    expect(document.body.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'desc'
    );
  });

  it('does not render the script or style content as an attribute', async () => {
    const { document } = await domRender(
      <QwikRouterMockProvider>
        <DocumentHeadTags
          scripts={[
            { type: 'application/ld+json', script: '{"a":1}' },
            { key: 'old', props: { type: 'text/x-old' }, script: 'old' },
          ]}
          styles={[{ key: 'probe', style: 'p{color:red}' }]}
        />
      </QwikRouterMockProvider>
    );

    const ld = document.body.querySelector('script[type="application/ld+json"]')!;
    expect(ld.textContent).toBe('{"a":1}');
    expect(ld.hasAttribute('script')).toBe(false);
    expect(document.body.querySelector('script[type="text/x-old"]')?.textContent).toBe('old');
    const style = document.body.querySelector('style')!;
    expect(style.textContent).toBe('p{color:red}');
    expect(style.hasAttribute('style')).toBe(false);
  });
});
