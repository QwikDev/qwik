import { describe, expect, it } from 'vitest';

import { highlight } from './prismjs';

describe('highlight', () => {
  it('escapes unsupported languages before injecting HTML', () => {
    const code = '</pre></code><img src=x onerror="alert(1)">';

    expect(highlight(code, 'json')).toBe(
      '&lt;/pre&gt;&lt;/code&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
  });

  it('keeps Prism highlighting for supported languages', () => {
    expect(highlight('const value = 1;', 'tsx')).toContain('token keyword');
  });
});
