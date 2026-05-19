import { describe, expect, it } from 'vitest';
import { _res, _chk, _val } from './bind-handlers';
import { createSignal } from '../../reactive-primitives/signal.public';
import { createDocument } from '@qwik.dev/core/testing';
import { QContainerAttr } from '../../shared/utils/markers';
import { setCaptures } from '../qrl/qrl-class';

describe('bind handlers', () => {
  describe('_res', () => {
    it('should handle being called with capture string without errors', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('div');
      document.body.appendChild(element);

      // Simulate capture string format: "0 1" (root IDs)
      const captureString = '0 1';

      // Call _res as qwikloader would - should not throw
      expect(() => _res.call(captureString, null, element)).not.toThrow();
    });

    it('should handle being called without capture string (as QRL)', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('div');
      document.body.appendChild(element);

      // Call _res without capture string (undefined this)
      expect(() => _res.call(undefined, null, element)).not.toThrow();
    });

    it('should be a true no-op (no side effects)', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('div');
      document.body.appendChild(element);

      const captureString = '0';

      // Call _res - it should do nothing visible
      const result = _res.call(captureString, null, element);

      // Returns undefined (no-op)
      expect(result).toBeUndefined();
    });
  });

  describe('_chk', () => {
    it('should update signal with checkbox checked state', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('input') as HTMLInputElement;
      element.type = 'checkbox';
      element.checked = true;
      document.body.appendChild(element);

      const signal = createSignal(false);

      // Manually set up captures for the test
      setCaptures([signal]);

      const captureString = undefined; // Captures already set

      _chk.call(captureString, null, element);

      expect(signal.value).toBe(true);
    });
  });

  describe('_val', () => {
    it('should update signal with input value', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('input') as HTMLInputElement;
      element.value = 'test value';
      document.body.appendChild(element);

      const signal = createSignal('');

      // Manually set up captures for the test
      setCaptures([signal]);

      const captureString = undefined; // Captures already set

      _val.call(captureString, null, element);

      expect(signal.value).toBe('test value');
    });

    it('should update signal with number input value', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('input') as HTMLInputElement;
      element.type = 'number';
      element.valueAsNumber = 42;
      document.body.appendChild(element);

      const signal = createSignal(0);

      // Manually set up captures for the test
      setCaptures([signal]);

      const captureString = undefined; // Captures already set

      _val.call(captureString, null, element);

      expect(signal.value).toBe(42);
    });
  });
});
