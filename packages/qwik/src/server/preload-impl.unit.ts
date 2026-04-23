import { describe, expect, it } from 'vitest';
import { includePreloader } from './preload-impl';

describe('includePreloader', () => {
  it('keeps absolute bundle paths intact in the injected preload script', () => {
    let scriptContent = '';

    const container = {
      $buildBase$: '/',
      resolvedManifest: {
        manifest: {
          preloader: 'preloader.js',
          core: 'core.js',
        },
      },
      openElement(_tagName: string, _key: any, _attrs: Record<string, string>) {},
      write(content: string) {
        scriptContent += content;
      },
      closeElement() {},
    };

    includePreloader(container as any, {}, ['/src/worker.js', 'build/chunk.js']);

    expect(scriptContent).toContain(`e.href=l.startsWith('/')?l:"/"+l;`);
    expect(scriptContent).not.toContain(`e.href="/"+l;`);
  });
});
