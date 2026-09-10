import { describe, it, expect } from 'vitest';
import { resolveEntryField } from '../../../src/optimizer/segment/entry-strategy.js';

const segment = {
  symbolName: 'App_component_abc123',
  origin: 'test.tsx',
  ctxKind: 'function' as const,
  ctxName: 'component$',
  captures: false,
};

describe('resolveEntryField', () => {
  describe('smart strategy', () => {
    it('keeps capture-free event handlers separate', () => {
      expect(
        resolveEntryField(
          'smart',
          { ...segment, symbolName: 'App_component_div_q_e_click_xyz', ctxKind: 'eventHandler' },
          undefined
        )
      ).toBeNull();
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
    it('returns parent component symbol for non-component segments', () => {
      expect(
        resolveEntryField(
          'component',
          { ...segment, symbolName: 'App_component_useTask_xyz', ctxName: 'useTask$' },
          undefined
        )
      ).toBe('test.tsx_entry_App');
    });

    it('returns null for component segments themselves', () => {
      expect(resolveEntryField('component', segment, undefined)).toBe('test.tsx_entry_App');
    });

    it('returns null when no parent component exists', () => {
      expect(
        resolveEntryField(
          'component',
          { ...segment, symbolName: 'someHandler_xyz', ctxKind: 'eventHandler' },
          undefined
        )
      ).toBe('entry_segments');
    });
  });

  describe('manual strategy', () => {
    it('returns mapped value when symbol is in manual map', () => {
      const manual = { App_component_abc123: 'vendor' };
      expect(resolveEntryField('smart', segment, manual)).toBe('vendor');
    });

    it('falls back to the selected strategy when symbol is not mapped', () => {
      const manual = { Other_component_xyz: 'vendor' };
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

    it('keeps route syntax in default component entry names', () => {
      expect(
        resolveEntryField(
          'smart',
          { ...segment, symbolName: 'slug_component_abc123', origin: 'routes/[[...slug]].tsx' },
          undefined
        )
      ).toBe('routes/[[...slug]].tsx_entry_[[...slug]]');
    });
  });
});
