import { createDocument } from '@qwik.dev/core/testing';
import { _deserialize } from '@qwik.dev/core/internal';
import { describe, expect, it } from 'vitest';
import { _serialize } from './index';

describe('serialized state script', () => {
  it.each(['<!-- <script>', '<!-- <ScRiPt>', `${'a'.repeat(128)}<!-- <script>`])(
    'keeps the script boundary for %s',
    async (value) => {
      const state = await _serialize({ value });
      const document = createDocument({
        html: `<script type="qwik/state">${state}</script><script id="after"></script>`,
      });

      expect(document.querySelector('script[type="qwik/state"]')?.textContent).toBe(state);
      expect(document.querySelector('#after')).not.toBeNull();
      expect(await _deserialize(state)).toEqual({ value });
    }
  );
});
