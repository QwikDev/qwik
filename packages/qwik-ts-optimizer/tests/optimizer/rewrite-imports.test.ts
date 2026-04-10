/**
 * Tests for import source path rewriting.
 *
 * Verifies that @builder.io/* package imports are correctly rewritten
 * to @qwik.dev/* equivalents with sub-path preservation.
 */
import { describe, it, expect } from 'vitest';
import { rewriteImportSource } from '../../src/optimizer/rewrite-imports.js';

describe('rewriteImportSource', () => {
  it('@builder.io/qwik -> @qwik.dev/core', () => {
    expect(rewriteImportSource('@builder.io/qwik')).toBe('@qwik.dev/core');
  });

  it('@builder.io/qwik/build -> @qwik.dev/core/build', () => {
    expect(rewriteImportSource('@builder.io/qwik/build')).toBe(
      '@qwik.dev/core/build'
    );
  });

  it('@builder.io/qwik/jsx-runtime -> @qwik.dev/core/jsx-runtime', () => {
    expect(rewriteImportSource('@builder.io/qwik/jsx-runtime')).toBe(
      '@qwik.dev/core/jsx-runtime'
    );
  });

  it('@builder.io/qwik-city -> @qwik.dev/router', () => {
    expect(rewriteImportSource('@builder.io/qwik-city')).toBe(
      '@qwik.dev/router'
    );
  });

  it('@builder.io/qwik-city/more/here -> @qwik.dev/router/more/here', () => {
    expect(rewriteImportSource('@builder.io/qwik-city/more/here')).toBe(
      '@qwik.dev/router/more/here'
    );
  });

  it('@builder.io/qwik-react -> @qwik.dev/react', () => {
    expect(rewriteImportSource('@builder.io/qwik-react')).toBe(
      '@qwik.dev/react'
    );
  });

  it('@builder.io/sdk -> @builder.io/sdk (no rewrite)', () => {
    expect(rewriteImportSource('@builder.io/sdk')).toBe('@builder.io/sdk');
  });

  it('react -> react (no rewrite)', () => {
    expect(rewriteImportSource('react')).toBe('react');
  });

  it('@qwik.dev/core -> @qwik.dev/core (already new, no rewrite)', () => {
    expect(rewriteImportSource('@qwik.dev/core')).toBe('@qwik.dev/core');
  });

  // Additional edge cases
  it('@builder.io/qwik/jsx-dev-runtime -> @qwik.dev/core/jsx-dev-runtime', () => {
    expect(rewriteImportSource('@builder.io/qwik/jsx-dev-runtime')).toBe(
      '@qwik.dev/core/jsx-dev-runtime'
    );
  });

  it('@builder.io/qwik-city does not match @builder.io/qwik rule', () => {
    // This ensures longer prefix matches first
    const result = rewriteImportSource('@builder.io/qwik-city');
    expect(result).toBe('@qwik.dev/router');
    expect(result).not.toBe('@qwik.dev/core-city');
  });
});
