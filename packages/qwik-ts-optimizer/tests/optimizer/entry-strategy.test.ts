/**
 * Tests for entry strategy resolution.
 *
 * Covers: ENT-01 (smart), ENT-03 (component), ENT-04 (manual), single strategy.
 */

import { describe, it, expect } from 'vitest';
import { resolveEntryField } from '../../src/optimizer/entry-strategy.js';

describe('resolveEntryField', () => {
  // ENT-01: Smart mode segments have entry: null
  describe('smart strategy', () => {
    it('returns null for smart strategy', () => {
      expect(resolveEntryField('smart', 'App_component_abc123', 'component', null, undefined)).toBeNull();
    });

    it('returns null for segment strategy (alias of smart)', () => {
      expect(resolveEntryField('segment', 'App_component_abc123', 'component', null, undefined)).toBeNull();
    });

    it('returns null for hook strategy (alias of smart)', () => {
      expect(resolveEntryField('hook', 'App_component_abc123', 'component', null, undefined)).toBeNull();
    });
  });

  // ENT-03: Component strategy sets entry to parent component symbol
  describe('component strategy', () => {
    it('returns parent component symbol for non-component segments', () => {
      expect(
        resolveEntryField('component', 'App_component_useTask_xyz', 'useTask', 'App_component_abc123', undefined),
      ).toBe('App_component_abc123');
    });

    it('returns null for component segments themselves', () => {
      expect(
        resolveEntryField('component', 'App_component_abc123', 'component', null, undefined),
      ).toBeNull();
    });

    it('returns null when no parent component exists', () => {
      expect(
        resolveEntryField('component', 'someHandler_xyz', 'eventHandler', null, undefined),
      ).toBeNull();
    });
  });

  // ENT-04: Manual strategy uses manual map
  describe('manual strategy', () => {
    it('returns mapped value when symbol is in manual map', () => {
      const manual = { 'App_component_abc123': 'vendor' };
      expect(
        resolveEntryField('smart', 'App_component_abc123', 'component', null, manual),
      ).toBe('vendor');
    });

    it('returns null when symbol is not in manual map', () => {
      const manual = { 'Other_component_xyz': 'vendor' };
      expect(
        resolveEntryField('smart', 'App_component_abc123', 'component', null, manual),
      ).toBeNull();
    });
  });

  // Single strategy: all segments grouped together
  describe('single strategy', () => {
    it('returns fixed entry name for single strategy', () => {
      const result = resolveEntryField('single', 'App_component_abc123', 'component', null, undefined);
      expect(result).toBe('entry_hooks');
    });
  });
});
