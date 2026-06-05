import { describe, expect, test } from 'vitest';
import { getBuildAnalysisIframeSrc } from './BuildAnalysis';

describe('getBuildAnalysisIframeSrc', () => {
  test('builds an absolute report URL from the current origin', () => {
    expect(getBuildAnalysisIframeSrc(3, 'http://localhost:3000')).toBe(
      'http://localhost:3000/__qwik_devtools/build-analysis/report?v=3'
    );
  });
});
