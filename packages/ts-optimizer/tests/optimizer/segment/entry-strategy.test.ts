import { describe, it, expect } from 'vitest';
import { resolveEntryField } from '../../../src/optimizer/segment/entry-strategy.js';

// Prod-mode symbol names carry only the hash; grouping must come from the context stack.
const segment = {
  symbolName: 's_abc123',
  rootContext: 'App' as string | null,
  origin: 'test.tsx',
  ctxKind: 'function' as const,
  ctxName: 'component$',
  captures: false,
};

describe('resolveEntryField', () => {
  describe('smart strategy', () => {
    it('keeps capture-free event handlers separate', () => {
      expect(
        resolveEntryField('smart', { ...segment, ctxKind: 'eventHandler' }, undefined)
      ).toBeNull();
    });

    it('keeps capture-free event$ functions separate', () => {
      expect(resolveEntryField('smart', { ...segment, ctxName: 'event$' }, undefined)).toBeNull();
    });

    it('groups event handlers that capture with their component', () => {
      expect(
        resolveEntryField(
          'smart',
          { ...segment, ctxKind: 'eventHandler', captures: true },
          undefined
        )
      ).toBe('test.tsx_entry_App');
    });

    it('returns null for segment strategy (alias of smart)', () => {
      expect(resolveEntryField('segment', segment, undefined)).toBeNull();
    });

    it('returns null for hook strategy (alias of smart)', () => {
      expect(resolveEntryField('hook', segment, undefined)).toBeNull();
    });

    it('leaves stripped inline segments ungrouped', () => {
      expect(resolveEntryField('inline', segment, undefined)).toBeNull();
    });
  });

  describe('component strategy', () => {
    it('groups inner segments with their root', () => {
      expect(resolveEntryField('component', { ...segment, ctxName: 'useTask$' }, undefined)).toBe(
        'test.tsx_entry_App'
      );
    });

    it('groups the component segment itself', () => {
      expect(resolveEntryField('component', segment, undefined)).toBe('test.tsx_entry_App');
    });

    it('falls back to the shared entry without a root context', () => {
      expect(
        resolveEntryField(
          'component',
          { ...segment, rootContext: null, ctxKind: 'eventHandler' },
          undefined
        )
      ).toBe('entry_segments');
    });
  });

  describe('manual strategy', () => {
    it('returns mapped value when symbol is in manual map', () => {
      const manual = { s_abc123: 'vendor' };
      expect(resolveEntryField('smart', segment, manual)).toBe('vendor');
    });

    it('falls back to the selected strategy when symbol is not mapped', () => {
      const manual = { s_other: 'vendor' };
      expect(resolveEntryField('smart', segment, manual)).toBe('test.tsx_entry_App');
    });
  });

  describe('single strategy', () => {
    it('returns fixed entry name for single strategy', () => {
      expect(resolveEntryField('single', segment, undefined)).toBe('entry_segments');
    });
  });

  describe('smart strategy grouping', () => {
    it('groups function segments by root component', () => {
      expect(resolveEntryField('smart', segment, undefined)).toBe('test.tsx_entry_App');
    });

    it('groups the segments of a hook by the hook', () => {
      expect(
        resolveEntryField(
          'smart',
          { ...segment, rootContext: 'useThing', ctxName: 'useTask$' },
          undefined
        )
      ).toBe('test.tsx_entry_useThing');
    });

    it('leaves a top-level segment without a root context ungrouped', () => {
      expect(resolveEntryField('smart', { ...segment, rootContext: null }, undefined)).toBeNull();
    });

    it('keeps route syntax in default component entry names', () => {
      expect(
        resolveEntryField(
          'smart',
          { ...segment, rootContext: 'slug', origin: 'routes/[[...slug]].tsx' },
          undefined
        )
      ).toBe('routes/[[...slug]].tsx_entry_[[...slug]]');
    });
  });
});
