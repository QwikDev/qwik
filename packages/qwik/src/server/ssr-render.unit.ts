import { describe, expect, test, vi } from 'vitest';
import { createQRL } from '../core/shared/qrl/qrl-class';
import { inlinedQrl } from '../core/shared/qrl/qrl';
import { _val } from '../core/runtime/bind-handlers';
import {
  createSsrNodeId,
  createSsrElementRecord,
  createSsrRecord,
  type SsrOutput,
  type SsrReferenceChunk,
} from '../core/ssr/output';
import { useContextProvider, type ContextId } from '../core/runtime/context';
import type { ContextScope } from '../core/runtime/context-scope';
import { getActiveInvokeContext } from '../core/runtime/invoke-context';
import { useTask } from '../core/runtime/task';
import { getLocale } from '../core/runtime/use-locale';
import { useServerData } from '../core/runtime/use-server-data';
import { useSignal } from '../core/reactive/public-api';
import { useOnDocument } from '../core/runtime/use-on';
import { createSsrSuspense } from '../core/dom/content/content';
import { _await } from '../core/reactive/tracking';
import { createSsrElementTextTarget, renderSsrTextNode } from '../core/dom/effect/ssr-effect';
import {
  renderToStreamCompiled as renderToStream,
  renderToStringCompiled as renderToString,
  type SsrRenderRoot,
} from './ssr-render';

describe('SSR context markers', () => {
  test('passes root props without a JSX wrapper', async () => {
    const result = await renderToString((props: { label: string }) => `<p>${props.label}</p>`, {
      props: { label: 'root-props' },
    });

    expect(result.html).toContain('<p>root-props</p>');
  });
  test('keeps the scope identity separate from its typed root reference', async () => {
    const context = { id: 'ssr-context' } as ContextId<string>;
    let scope!: ContextScope;
    let firstRef!: SsrReferenceChunk;
    let secondRef!: SsrReferenceChunk;

    const result = await renderToString((_props, ctx) => {
      useContextProvider(context, 'value');
      scope = getActiveInvokeContext().localContextScope!;
      firstRef = ctx.contextScopeRef();
      secondRef = ctx.contextScopeRef();
      return [createSsrRecord('<!c=', firstRef, '>'), '<p>value</p>', '<!/c>'];
    });

    expect(firstRef).toEqual({ type: 'root-ref', localId: 0 });
    expect(secondRef).toEqual(firstRef);
    expect(scope.id).toBeNull();
    expect(result.html).toContain('<!c=0><p>value</p><!/c>');
  });

  test('materializes event captures and nested structured output without coercion', async () => {
    const captured = { value: 'captured' };
    const handler = createQRL('./listener.js', '_handler', () => {}, null, [captured]);

    const result = await renderToString((_props, ctx) => [
      createSsrElementRecord('button', '<button', ctx.eventAttr('q-e:click', handler), '>'),
      ['before', [createSsrRecord('<!r=', createSsrNodeId(ctx.nextId()), '>'), 'row', '<!/r>']],
      '</button>',
    ]);

    expect(result.html).toContain(
      '<button q-e:click="listener.js#_handler#0">before<!r=0>row<!/r></button>'
    );
    expect(result.html).not.toContain('[object Object]');
    expect(result.html).not.toContain(',before');
  });

  test('serializes an inlined bind handler capture once', async () => {
    const result = await renderToString((_props, ctx) => {
      const value = useSignal('server');
      ctx.addRoot(value);
      return createSsrElementRecord(
        'input',
        '<input',
        ctx.eventAttr('q-e:input', inlinedQrl(_val, '_val', [value])),
        '>'
      );
    });

    expect(result.html).toMatch(/q-e:input="[^"]+#_val#0"/);
    expect(result.html).toContain('q:len="1"');
  });

  test('keeps structured records intact until the output writer', async () => {
    const chunks: string[] = [];

    await renderToStream(
      (_props, ctx) => [
        'before',
        createSsrElementRecord('span', '<span data-node="', createSsrNodeId(ctx.nextId()), '">'),
        'after</span>',
      ],
      {
        containerTagName: 'div',
        stream: { write: (chunk) => void chunks.push(chunk) },
      }
    );

    expect(chunks.slice(1, -1)).toEqual(['before', '<span data-node="0">', 'after</span>']);
    expect(chunks[chunks.length - 1]).toBe('</div>');
  });

  test('inserts styles into structured document output', async () => {
    const result = await renderToString((_props, ctx) => {
      ctx.styleIds.set('sheet', 'p{color:red}');
      return [
        createSsrElementRecord('head', '<head data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<title>x</title></head>',
        createSsrElementRecord('body', '<body data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<p>x</p></body>',
      ];
    });

    expect(result.html).toContain(
      '<head data-node="0"><title>x</title><style q:style="sheet">p{color:red}</style></head>'
    );
    expect(result.html).toContain('<body data-node="1"><p>x</p></body>');
  });

  test('keeps stream and string output identical', async () => {
    const root: SsrRenderRoot = (_props, ctx) => {
      ctx.styleIds.set('sheet', 'p{}');
      return [
        createSsrElementRecord('body', '<body data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<p>value</p></body>',
      ];
    };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      const stringResult = await renderToString(root);
      const chunks: string[] = [];
      await renderToStream(root, { stream: { write: (chunk) => void chunks.push(chunk) } });

      expect(chunks.join('')).toBe(stringResult.html);
    } finally {
      random.mockRestore();
    }
  });

  test('isolates concurrent request locales', async () => {
    let entered = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const root: SsrRenderRoot = async () => {
      const before = getLocale();
      if (++entered === 2) {
        release();
      }
      await barrier;
      return `<p>${before}:${getLocale()}</p>`;
    };

    const [polish, english] = await Promise.all([
      renderToString(root, { locale: 'pl' }),
      renderToString(root, { locale: 'en' }),
    ]);

    expect(polish.html).toContain('<p>pl:pl</p>');
    expect(english.html).toContain('<p>en:en</p>');
  });

  test('keeps request data local while preserving stream and string parity', async () => {
    const root: SsrRenderRoot = () => `<p>${useServerData('value', 'fallback')}</p>`;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      const stringResult = await renderToString(root, {
        serverData: { value: 'request-value', secret: 'unused-server-secret' },
      });
      const chunks: string[] = [];
      await renderToStream(root, {
        serverData: { value: 'request-value', secret: 'unused-server-secret' },
        stream: { write: (chunk) => void chunks.push(chunk) },
      });

      expect(chunks.join('')).toBe(stringResult.html);
      expect(stringResult.html).toContain('<p>request-value</p>');
      expect(stringResult.html).not.toContain('unused-server-secret');
    } finally {
      random.mockRestore();
    }
  });

  test('moves a headless global event carrier into document head', async () => {
    const handler = createQRL('./listener.js', '_handler', () => {}, null, []);
    const result = await renderToString(
      () => {
        useOnDocument('qinit', handler);
        return '<body><p>value</p></body>';
      },
      { containerTagName: 'html' }
    );

    const head = result.html.slice(result.html.indexOf('<head>'), result.html.indexOf('</head>'));
    expect(head).toContain('<script hidden q-d:qinit="listener.js#_handler"></script>');
    expect(result.html.indexOf('<script hidden')).toBeLessThan(result.html.indexOf('<body>'));
  });

  test('flushes task work before serializing the root output', async () => {
    let resolve!: () => void;
    let completed = false;
    const pending = new Promise<void>((done) => (resolve = done));

    const rendering = renderToString(() => {
      useTask(() =>
        pending.then(() => {
          completed = true;
        })
      );
      return '<p>ready</p>';
    });

    await Promise.resolve();
    expect(completed).toBe(false);
    resolve();

    const result = await rendering;
    expect(completed).toBe(true);
    expect(result.html).toContain('<p>ready</p>');
  });

  test('keeps synchronous Suspense content inline', async () => {
    const fallback = vi.fn(() => '<p>fallback</p>');

    const result = await renderToString((_props, ctx) =>
      createSsrSuspense(
        ctx,
        ctx.nextId(),
        createQRL('', 'content', () => '<p>content</p>', null, null),
        createQRL('', 'fallback', fallback, null, null)
      )
    );

    expect(result.html).toContain('<!d=0><p>content</p><!/d>');
    expect(result.html).not.toContain('q:s=');
    expect(fallback).not.toHaveBeenCalled();
  });

  test('writes a fallback shell before its resolved packet', async () => {
    let resolveContent!: (value: string) => void;
    const content = new Promise<string>((resolve) => (resolveContent = resolve));
    let shellWritten!: () => void;
    const shell = new Promise<void>((resolve) => (shellWritten = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL('', 'content', () => content, null, null),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        ),
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('fallback')) {
              shellWritten();
            }
          },
        },
      }
    );

    await shell;
    expect(chunks.join('')).toContain('<p>fallback</p>');
    expect(chunks.join('')).not.toContain('<p>content</p>');
    expect(chunks).not.toContain('</div>');

    resolveContent('<p>content</p>');
    await rendering;

    const html = chunks.join('');
    expect(html).not.toContain('q:sub');
    expect(html).toContain('<template q:s="0"><p>content</p></template>');
    const shellState = html.match(/type="qwik\/state" q:base="0" q:len="(\d+)"/);
    const packetState = html.match(/type="qwik\/state" q:s="0" q:base="(\d+)"/);
    expect(shellState).not.toBeNull();
    expect(packetState).not.toBeNull();
    expect(packetState?.[1]).toBe(shellState?.[1]);
    expect(html.indexOf('<p>fallback</p>')).toBeLessThan(html.indexOf('<p>content</p>'));
    expect(html.endsWith('</div>')).toBe(true);
  });

  test('streams new dependency edges for state already serialized in the shell', async () => {
    let resolveContent!: () => void;
    const content = new Promise<void>((resolve) => (resolveContent = resolve));
    let shellWritten!: () => void;
    const shell = new Promise<void>((resolve) => (shellWritten = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) => {
        const count = useSignal(0);
        ctx.addRoot(count);
        return createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            () =>
              _await(content).then((resume) => {
                resume();
                return `<p>${renderSsrTextNode(createSsrElementTextTarget(0), count)}</p>`;
              }),
            null,
            null
          ),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        );
      },
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('fallback')) {
              shellWritten();
            }
          },
        },
      }
    );

    await shell;
    resolveContent();
    await rendering;

    const html = chunks.join('');
    const metadata = html.match(/<script[^>]*q:sub[^>]*>(.*?)<\/script>/);
    expect(metadata).not.toBeNull();
    const [sourceId, subscriberId] = JSON.parse(metadata![1]) as number[];
    expect(sourceId).toBe(0);
    expect(subscriberId).toBeGreaterThan(0);
    expect(html).toMatch(/window\._qwikS\(document\.currentScript,0,\d+,/);
  });

  test('writes sibling packets in resolution order', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const first = new Promise<string>((resolve) => (resolveFirst = resolve));
    const second = new Promise<string>((resolve) => (resolveSecond = resolve));
    let shellWritten!: () => void;
    const shell = new Promise<void>((resolve) => (shellWritten = resolve));
    let secondWritten!: () => void;
    const secondPacket = new Promise<void>((resolve) => (secondWritten = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) => [
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL('', 'first', () => first, null, null),
          createQRL('', 'firstFallback', () => 'first fallback', null, null)
        ) as SsrOutput,
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL('', 'second', () => second, null, null),
          createQRL('', 'secondFallback', () => 'second fallback', null, null)
        ) as SsrOutput,
      ],
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('second fallback')) {
              shellWritten();
            }
            if (chunk.includes('second content')) {
              secondWritten();
            }
          },
        },
      }
    );

    await shell;
    resolveSecond('second content');
    await secondPacket;
    expect(chunks.join('')).not.toContain('first content');

    resolveFirst('first content');
    await rendering;

    const html = chunks.join('');
    expect(html.indexOf('second content')).toBeLessThan(html.indexOf('first content'));
  });

  test('skips delayed SSR fallback when content wins', async () => {
    let resolveContent!: (value: string) => void;
    const content = new Promise<string>((resolve) => (resolveContent = resolve));
    const fallback = vi.fn(() => 'fallback');
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL('', 'content', () => content, null, null),
          createQRL('', 'fallback', fallback, null, null),
          20
        ),
      { stream: { write: (chunk) => void chunks.push(chunk) } }
    );

    resolveContent('content');
    await rendering;

    expect(chunks.join('')).toContain('<!d=0>content<!/d>');
    expect(chunks.join('')).not.toContain('q:s=');
    expect(fallback).not.toHaveBeenCalled();
  });

  test('renders final content without OOOS protocol for strings', async () => {
    const fallback = vi.fn(() => 'fallback');
    const result = await renderToString((_props, ctx) =>
      createSsrSuspense(
        ctx,
        ctx.nextId(),
        createQRL('', 'content', () => Promise.resolve('content'), null, null),
        createQRL('', 'fallback', fallback, null, null)
      )
    );

    expect(result.html).toContain('<!d=0>content<!/d>');
    expect(result.html).not.toContain('q:s=');
    expect(fallback).not.toHaveBeenCalled();
  });

  test('renders parser-sensitive component contexts in order', async () => {
    const fallback = vi.fn(() => 'fallback');
    const chunks: string[] = [];

    await renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx.inOrder(),
          ctx.nextId(),
          createQRL('', 'content', () => Promise.resolve('content'), null, null),
          createQRL('', 'fallback', fallback, null, null)
        ),
      { stream: { write: (chunk) => void chunks.push(chunk) } }
    );

    expect(chunks.join('')).toContain('<!d=0>content<!/d>');
    expect(chunks.join('')).not.toContain('q:s=');
    expect(fallback).not.toHaveBeenCalled();
  });

  test('gates a resolved child packet behind its parent packet', async () => {
    let resolveOuter!: () => void;
    const outer = new Promise<void>((resolve) => (resolveOuter = resolve));
    let shellWritten!: () => void;
    const shell = new Promise<void>((resolve) => (shellWritten = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'outer',
            (contentCtx) => {
              const child = createSsrSuspense(
                contentCtx,
                contentCtx.nextId(),
                createQRL('', 'inner', () => Promise.resolve('inner content'), null, null),
                createQRL('', 'innerFallback', () => 'inner fallback', null, null)
              ) as SsrOutput;
              return outer.then(() => ['outer content', child]);
            },
            null,
            null
          ),
          createQRL('', 'outerFallback', () => 'outer fallback', null, null)
        ),
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('outer fallback')) {
              shellWritten();
            }
          },
        },
      }
    );

    await shell;
    resolveOuter();
    await rendering;

    const html = chunks.join('');
    expect(html.indexOf('outer content')).toBeLessThan(html.indexOf('inner content'));
    expect(html.endsWith('</div>')).toBe(true);
  });

  test('stops shell writes when deferred content rejects under backpressure', async () => {
    let rejectContent!: (error: Error) => void;
    const content = new Promise<string>((_resolve, reject) => (rejectContent = reject));
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => (releaseWrite = resolve));
    let firstWrite!: () => void;
    const started = new Promise<void>((resolve) => (firstWrite = resolve));
    const chunks: string[] = [];
    let writes = 0;

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL('', 'content', () => content, null, null),
          createQRL('', 'fallback', () => 'fallback', null, null)
        ),
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (writes++ === 0) {
              firstWrite();
              return blockedWrite;
            }
          },
        },
      }
    );

    await started;
    const error = new Error('content failed');
    rejectContent(error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseWrite();

    await expect(rendering).rejects.toBe(error);
    expect(chunks).toHaveLength(1);
    expect(chunks.join('')).not.toContain('fallback');
    expect(chunks.join('')).not.toContain('</div>');
  });

  test('cancels fallback-owned boundaries when fallback is removed', async () => {
    let resolveOuter!: (value: string) => void;
    const outer = new Promise<string>((resolve) => (resolveOuter = resolve));
    const never = new Promise<string>(() => {});
    let shellWritten!: () => void;
    const shell = new Promise<void>((resolve) => (shellWritten = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL('', 'outer', () => outer, null, null),
          createQRL(
            '',
            'outerFallback',
            (fallbackCtx) => [
              'outer fallback',
              createSsrSuspense(
                fallbackCtx,
                fallbackCtx.nextId(),
                createQRL('', 'inner', () => never, null, null),
                createQRL('', 'innerFallback', () => 'inner fallback', null, null)
              ) as SsrOutput,
            ],
            null,
            null
          )
        ),
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('outer fallback')) {
              shellWritten();
            }
          },
        },
      }
    );

    await shell;
    resolveOuter('outer content');
    await rendering;

    expect(chunks.join('')).toContain('outer content');
    expect(chunks.join('')).not.toContain('inner content');
    expect(chunks.join('')).toMatch(/disposeRoot\(r\)/);
    expect(chunks.join('').endsWith('</div>')).toBe(true);
  });
});
