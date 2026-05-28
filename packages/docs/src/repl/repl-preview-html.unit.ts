import { describe, expect, test } from 'vitest';
import { createPreviewStyleInjector, injectPreviewStyle } from './repl-preview-html';

const previewStyleMarker = 'data-repl-preview-font';

describe('REPL preview HTML font style', () => {
  test('injects the preview style into complete HTML', () => {
    const html = injectPreviewStyle('<!doctype html><html><head><title>Demo</title></head></html>');

    expect(html).toContain(`<title>Demo</title><style ${previewStyleMarker}>`);
    expect(html.match(new RegExp(previewStyleMarker, 'g'))).toHaveLength(1);
  });

  test('injects the preview style when streamed HTML reaches the head', () => {
    const injector = createPreviewStyleInjector();

    expect(injector.write('<!doctype html><html>')).toBe('');
    const firstChunk = injector.write('<head><title>Demo</title>');

    expect(firstChunk).toContain(`<html><head><style ${previewStyleMarker}>`);
    expect(firstChunk.match(new RegExp(previewStyleMarker, 'g'))).toHaveLength(1);
    expect(injector.write('</head><body>Preview</body></html>')).toBe(
      '</head><body>Preview</body></html>'
    );
    expect(injector.flush()).toBe('');
  });

  test('flushes the preview style for HTML fragments without head or body', () => {
    const injector = createPreviewStyleInjector();

    expect(injector.write('<main>Preview</main>')).toBe('');
    const html = injector.flush();

    expect(html).toContain(`<style ${previewStyleMarker}>`);
    expect(html).toContain('<main>Preview</main>');
  });
});
