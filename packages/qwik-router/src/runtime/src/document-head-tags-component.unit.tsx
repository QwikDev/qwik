import { component$ } from '@qwik.dev/core';
import { _hasStoreEffects } from '@qwik.dev/core/internal';
import { domRender } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { DocumentHeadTags } from './document-head-tags-component';
import { QwikRouterMockProvider } from './qwik-router-component';
import type { ResolvedDocumentHead } from './types';
import { useDocumentHead } from './use-functions';

const captured: { head?: ResolvedDocumentHead } = {};

const CaptureHead = component$(() => {
  captured.head = useDocumentHead();
  return null;
});

describe('DocumentHeadTags', () => {
  it('subscribes only to the head fields it renders', async () => {
    await domRender(
      <QwikRouterMockProvider>
        <CaptureHead />
        <DocumentHeadTags />
      </QwikRouterMockProvider>
    );
    const head = captured.head!;

    expect(_hasStoreEffects(head, 'title')).toBe(true);
    expect(_hasStoreEffects(head, 'meta')).toBe(true);
    expect(_hasStoreEffects(head, 'frontmatter')).toBe(false);
    expect(_hasStoreEffects(head, 'manifestHash')).toBe(false);
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
});
