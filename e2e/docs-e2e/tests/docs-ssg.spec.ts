import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const docsDistDir = resolve(__dirname, '../../../packages/docs/dist');

// SSG tests only run in CI where we have the built output
const describeSSG = process.env.CI ? test.describe : test.describe.skip;

describeSSG('SSG output verification', () => {
  test('home page SSG file exists', () => {
    const indexPath = resolve(docsDistDir, 'index.html');
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('Qwik');
  });

  test('docs overview SSG file exists', () => {
    const docsPath = resolve(docsDistDir, 'docs', 'index.html');
    expect(existsSync(docsPath)).toBe(true);

    const content = readFileSync(docsPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
  });

  test('ecosystem SSG file exists', () => {
    const ecoPath = resolve(docsDistDir, 'ecosystem', 'index.html');
    expect(existsSync(ecoPath)).toBe(true);
  });

  test('getting started SSG file exists', () => {
    const gettingStartedPath = resolve(docsDistDir, 'docs', 'getting-started', 'index.html');
    expect(existsSync(gettingStartedPath)).toBe(true);
  });

  test('q-manifest.json exists', () => {
    const manifestPath = resolve(docsDistDir, 'q-manifest.json');
    expect(existsSync(manifestPath)).toBe(true);

    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest).toHaveProperty('manifestHash');
  });
});
