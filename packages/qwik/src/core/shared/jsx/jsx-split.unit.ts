import { describe, it, expect } from 'vitest';
import { _jsxSplit } from './jsx-internal';
import type { QRL } from '../qrl/qrl.public';

describe('_jsxSplit', () => {
  describe('event name conversion', () => {
    it('should convert onClick$ to on:click in varProps', () => {
      const node = _jsxSplit('button', { onClick$: (() => {}) as any as QRL }, null, null, 0);
      expect(node.varProps['onClick$']).toBeUndefined();
      expect(node.varProps['on:click']).toBeDefined();
    });

    it('should convert onClick$ to on:click in constProps', () => {
      const node = _jsxSplit('button', null, { onClick$: (() => {}) as any as QRL }, null, 0);
      expect(node.constProps?.['onClick$']).toBeUndefined();
      expect(node.constProps?.['on:click']).toBeDefined();
    });

    it('should convert onInput$ to on:input in varProps', () => {
      const node = _jsxSplit('input', { onInput$: (() => {}) as any as QRL }, null, null, 0);
      expect(node.varProps['onInput$']).toBeUndefined();
      expect(node.varProps['on:input']).toBeDefined();
    });

    it('should convert multiple event handlers', () => {
      const node = _jsxSplit(
        'button',
        {
          onClick$: (() => {}) as any as QRL,
          onMouseOver$: (() => {}) as any as QRL,
        },
        null,
        null,
        0
      );
      expect(node.varProps['onClick$']).toBeUndefined();
      expect(node.varProps['onMouseOver$']).toBeUndefined();
      expect(node.varProps['on:click']).toBeDefined();
      expect(node.varProps['on:mouseover']).toBeDefined();
    });
  });

  describe('event handling between constProps and varProps', () => {
    it('should let constProps overwrite varProps when both have same event', () => {
      const constHandler = (() => {}) as any as QRL;
      const varHandler = (() => {}) as any as QRL;

      const node = _jsxSplit(
        'input',
        { onInput$: varHandler },
        { 'on:input': constHandler },
        null,
        0
      );

      // varProps should be transformed but then removed during deduplication
      expect(node.varProps['onInput$']).toBeUndefined();
      expect(node.varProps['on:input']).toBeUndefined();

      // constProps keeps its handler (no merging)
      expect(node.constProps?.['on:input']).toBe(constHandler);
    });

    it('should let constProps overwrite varProps after transformation', () => {
      const constHandler = (() => {}) as any as QRL;
      const varHandler = (() => {}) as any as QRL;

      const node = _jsxSplit(
        'input',
        { 'on:input': varHandler },
        { onInput$: constHandler },
        null,
        0
      );

      // constProps transformed and constProps wins
      expect(node.constProps?.['onInput$']).toBeUndefined();
      expect(node.constProps?.['on:input']).toBe(constHandler);
      expect(node.varProps['on:input']).toBeUndefined();
    });

    it('should handle multiple different events in both props', () => {
      const clickHandler1 = (() => {}) as any as QRL;
      const clickHandler2 = (() => {}) as any as QRL;
      const inputHandler1 = (() => {}) as any as QRL;
      const inputHandler2 = (() => {}) as any as QRL;

      const node = _jsxSplit(
        'input',
        {
          onClick$: clickHandler2,
          onInput$: inputHandler2,
        },
        {
          onClick$: clickHandler1,
          'on:input': inputHandler1,
        },
        null,
        0
      );

      // constProps wins for both (no merging)
      expect(node.constProps?.['on:click']).toBe(clickHandler1);
      expect(node.constProps?.['on:input']).toBe(inputHandler1);
      expect(node.varProps['on:click']).toBeUndefined();
      expect(node.varProps['on:input']).toBeUndefined();
    });

    it('should keep events separate when no overlap', () => {
      const clickHandler = (() => {}) as any as QRL;
      const inputHandler = (() => {}) as any as QRL;

      const node = _jsxSplit(
        'input',
        { onClick$: clickHandler },
        { onInput$: inputHandler },
        null,
        0
      );

      // Both should be kept in their respective locations
      expect(node.varProps['on:click']).toBe(clickHandler);
      expect(node.constProps?.['on:input']).toBe(inputHandler);
    });
  });

  describe('bind:value integration with events', () => {
    it('should handle bind:value with onInput$ in varProps', () => {
      const handler = (() => {}) as any as QRL;
      const signal = { value: 'test' };

      const node = _jsxSplit(
        'input',
        {
          'bind:value': signal,
          onInput$: handler,
        },
        null,
        null,
        0
      );

      expect(node.varProps['bind:value']).toBeUndefined();
      expect(node.varProps.value).toBe(signal);

      const merged = node.varProps['on:input'];
      expect(merged).toBeDefined();
      expect(Array.isArray(merged)).toBe(true);
      if (Array.isArray(merged)) {
        // Should have bind handler + user handler
        expect(merged.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should move on:input from constProps to varProps when bind:value is in varProps', () => {
      const handler = (() => {}) as any as QRL;
      const signal = { value: 'test' };

      const node = _jsxSplit(
        'input',
        {
          'bind:value': signal,
        },
        {
          'on:input': handler,
        },
        null,
        0
      );

      expect(node.varProps['bind:value']).toBeUndefined();
      expect(node.varProps.value).toBe(signal);

      // on:input should be moved from constProps to varProps and merged with bind handler
      expect(node.constProps?.['on:input']).toBeUndefined();
      const merged = node.varProps['on:input'];
      expect(merged).toBeDefined();
      expect(Array.isArray(merged)).toBe(true);
      if (Array.isArray(merged)) {
        expect(merged).toHaveLength(2);
        expect(merged[0]).toBe(handler); // Original handler from constProps (moved)
        // merged[1] should be the bind handler
      }
    });
  });

  describe('className to class conversion', () => {
    it('should convert className to class in varProps', () => {
      const node = _jsxSplit('div', { className: 'my-class' }, null, null, 0);

      expect(node.varProps.className).toBeUndefined();
      expect(node.varProps.class).toBe('my-class');
    });

    it('should convert className to class in constProps', () => {
      const node = _jsxSplit('div', null, { className: 'my-class' }, null, 0);

      expect(node.constProps?.className).toBeUndefined();
      expect(node.constProps?.class).toBe('my-class');
    });
  });

  describe('children and key extraction', () => {
    it('should extract children from varProps', () => {
      const children = 'Hello';
      const node = _jsxSplit('div', { children }, null, null, 0);

      expect(node.varProps.children).toBeUndefined();
      expect(node.children).toBe(children);
    });

    it('should extract key from varProps', () => {
      const node = _jsxSplit('div', { key: 'my-key' }, null, null, 0);

      expect(node.varProps.key).toBeUndefined();
      expect(node.key).toBe('my-key');
    });

    it('should prefer explicit children parameter over varProps', () => {
      const explicitChildren = 'Explicit';
      const propsChildren = 'Props';

      const node = _jsxSplit('div', { children: propsChildren }, null, explicitChildren, 0);

      expect(node.children).toBe(explicitChildren);
    });
  });

  describe('deduplication between varProps and constProps', () => {
    it('should remove duplicate keys from varProps that exist in constProps', () => {
      const node = _jsxSplit(
        'div',
        { id: 'var-id', class: 'var-class' },
        { id: 'const-id' },
        null,
        0
      );

      expect(node.varProps.id).toBeUndefined();
      expect(node.varProps.class).toBe('var-class');
      expect(node.constProps?.id).toBe('const-id');
    });
  });

  describe('non-HTML elements', () => {
    it('should not convert events for function components', () => {
      const Component = () => null;
      const handler = (() => {}) as any as QRL;

      const node = _jsxSplit(Component as any, { onClick$: handler }, null, null, 0);

      // For components, events should not be converted
      expect(node.varProps['onClick$']).toBeDefined();
      expect(node.varProps['on:click']).toBeUndefined();
    });
  });

  describe('copy-on-write optimization', () => {
    it('should not mutate original varProps when converting events', () => {
      const handler = (() => {}) as any as QRL;
      const originalVarProps = { onClick$: handler, id: 'test' };
      const originalRef = originalVarProps;

      const node = _jsxSplit('button', originalVarProps, null, null, 0);

      // Original object should not be mutated
      expect(originalRef.onClick$).toBe(handler);
      expect((originalRef as any)['on:click']).toBeUndefined();
      expect(originalRef.id).toBe('test');

      // Result should have converted event
      expect(node.varProps['on:click']).toBeDefined();
      expect(node.varProps.id).toBe('test');
    });

    it('should not mutate original constProps when converting events', () => {
      const handler = (() => {}) as any as QRL;
      const originalConstProps = { onClick$: handler, id: 'test' };
      const originalRef = originalConstProps;

      const node = _jsxSplit('button', null, originalConstProps, null, 0);

      // Original object should not be mutated
      expect(originalRef.onClick$).toBe(handler);
      expect((originalRef as any)['on:click']).toBeUndefined();
      expect(originalRef.id).toBe('test');

      // Result should have converted event
      expect(node.constProps?.['on:click']).toBeDefined();
      expect(node.constProps?.id).toBe('test');
    });

    it('should not mutate original varProps when handling bind:checked', () => {
      const signal = { value: true } as any;
      const originalVarProps = { 'bind:checked': signal, id: 'test' };
      const originalRef = originalVarProps;

      const node = _jsxSplit('input', originalVarProps, null, null, 0);

      // Original object should not be mutated
      expect(originalRef['bind:checked']).toBe(signal);
      expect(originalRef.id).toBe('test');
      expect((originalRef as any).checked).toBeUndefined();
      expect((originalRef as any)['on:input']).toBeUndefined();

      // Result should have checked and on:input (not on:change)
      expect(node.varProps.checked).toBeDefined();
      expect(node.varProps['on:input']).toBeDefined();
      expect(node.varProps['bind:checked']).toBeUndefined();
      expect(node.varProps.id).toBe('test');
    });

    it('should not mutate original varProps when deduplicating with constProps', () => {
      const originalVarProps = { id: 'var-id', class: 'var-class' };
      const originalRef = originalVarProps;

      const node = _jsxSplit('div', originalVarProps, { id: 'const-id' }, null, 0);

      // Original object should not be mutated
      expect(originalRef.id).toBe('var-id');
      expect(originalRef.class).toBe('var-class');

      // Result should have deduplicated (id removed from varProps)
      expect(node.varProps.id).toBeUndefined();
      expect(node.varProps.class).toBe('var-class');
      expect(node.constProps?.id).toBe('const-id');
    });

    it('should not mutate original varProps when removing children', () => {
      const originalVarProps = { id: 'test', children: 'child content' };
      const originalRef = originalVarProps;

      const node = _jsxSplit('div', originalVarProps, null, null, 0);

      // Original object should not be mutated
      expect(originalRef.children).toBe('child content');
      expect(originalRef.id).toBe('test');

      // Result should have children extracted and id preserved
      expect(node.varProps.children).toBeUndefined();
      expect(node.varProps.id).toBe('test');
      expect(node.children).toBe('child content');
    });

    it('should not mutate original varProps when removing key', () => {
      const originalVarProps = { id: 'test', key: 'my-key' };
      const originalRef = originalVarProps;

      const node = _jsxSplit('div', originalVarProps, null, null, 0);

      // Original object should not be mutated
      expect(originalRef.key).toBe('my-key');
      expect(originalRef.id).toBe('test');

      // Result should have key extracted and id preserved
      expect(node.varProps.key).toBeUndefined();
      expect(node.varProps.id).toBe('test');
      expect(node.key).toBe('my-key');
    });

    it('should not mutate original varProps when converting className', () => {
      const originalVarProps = { className: 'test-class', id: 'test' };
      const originalRef = originalVarProps;

      const node = _jsxSplit('div', originalVarProps, null, null, 0);

      // Original object should not be mutated
      expect(originalRef.className).toBe('test-class');
      expect(originalRef.id).toBe('test');

      // Result should have class instead of className
      expect(node.varProps.className).toBeUndefined();
      expect(node.varProps.class).toBe('test-class');
      expect(node.varProps.id).toBe('test');
    });

    it('should not copy when no modifications are needed', () => {
      const originalVarProps = { id: 'test', 'data-value': '123' };

      const node = _jsxSplit('div', originalVarProps, null, null, 0);

      // When no modifications are needed, should use same reference
      expect(node.varProps).toBe(originalVarProps);
      expect(node.varProps.id).toBe('test');
      expect(node.varProps['data-value']).toBe('123');
    });

    it('should not copy constProps when no modifications are needed', () => {
      const originalConstProps = { id: 'test', 'data-value': '123' };

      const node = _jsxSplit('div', null, originalConstProps, null, 0);

      // When no modifications are needed, should use same reference
      expect(node.constProps).toBe(originalConstProps);
      expect(node.constProps?.id).toBe('test');
      expect(node.constProps?.['data-value']).toBe('123');
    });

    it('should handle multiple modifications with single copy', () => {
      const handler1 = (() => {}) as any as QRL;
      const handler2 = (() => {}) as any as QRL;
      const originalVarProps = {
        onClick$: handler1,
        onInput$: handler2,
        className: 'test-class',
        key: 'my-key',
        id: 'test',
      };
      const originalRef = originalVarProps;

      const node = _jsxSplit('input', originalVarProps, null, null, 0);

      // Original should be untouched
      expect(originalRef.onClick$).toBe(handler1);
      expect(originalRef.onInput$).toBe(handler2);
      expect(originalRef.className).toBe('test-class');
      expect(originalRef.key).toBe('my-key');
      expect(originalRef.id).toBe('test');

      // Result should have all transformations applied
      expect(node.varProps['on:click']).toBeDefined();
      expect(node.varProps['on:input']).toBeDefined();
      expect(node.varProps.class).toBe('test-class');
      expect(node.varProps.className).toBeUndefined();
      expect(node.varProps.key).toBeUndefined();
      expect(node.varProps.id).toBe('test');
      expect(node.key).toBe('my-key');

      // Should be a different object (only one copy made)
      expect(node.varProps).not.toBe(originalRef);
    });
  });
});
