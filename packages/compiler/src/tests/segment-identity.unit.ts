/** The expected symbols are captured legacy-compiler output — wire identity must never drift. */
import { describe, expect, test } from 'vitest';
import {
  createSegmentSourceIdentity,
  createSegmentSymbolName,
  getSegmentDisplayName,
  getSegmentSymbolHash,
  sanitizeSegmentName,
} from '../segment-identity';

describe('segment identity', () => {
  test('event segment symbol matches the captured wire name', () => {
    const identity = createSegmentSourceIdentity('src/component.tsx');
    const symbol = createSegmentSymbolName(
      identity,
      sanitizeSegmentName('component_q-e:click_segment_0'),
      'extracted'
    );
    expect(symbol).toBe('component_q_e_click_segment_0_2xwyg1cinvmpz');
    expect(getSegmentSymbolHash(symbol)).toBe('2xwyg1cinvmpz');
    expect(getSegmentDisplayName(symbol)).toBe('component_q_e_click_segment_0');
  });

  test('sanitization spells out $ and normalizes illegal characters', () => {
    expect(sanitizeSegmentName('component_onClick$_segment_0')).toBe(
      'component_onClickqrl_segment_0'
    );
    expect(sanitizeSegmentName('1bad-name')).toBe('_1bad_name');
  });

  test('source identity normalizes paths and applies the scope prefix', () => {
    expect(createSegmentSourceIdentity('src\\a\\..\\component.tsx')).toBe('\0src/component.tsx');
    expect(createSegmentSourceIdentity('/abs/x.tsx', 'lib')).toBe('lib\0/abs/x.tsx');
  });
});
