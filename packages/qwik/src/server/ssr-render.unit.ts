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
import {
  createSsrElementTarget,
  createSsrElementTextTarget,
  renderSsrAttr,
  renderSsrAttrExpression,
  renderSsrTextNode,
} from '../core/dom/effect/ssr-effect';
import {
  renderToStreamCompiled as renderToStream,
  renderToStringCompiled as renderToString,
  type SsrRenderRoot,
} from './ssr-render';

const FINAL_ATTRIBUTE_PATCH = '[0,"aria-describedby","final-id"]';

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

  test('streams the initial attribute before its blocking-task backpatch', async () => {
    let taskStarted!: () => void;
    let resolveTask!: () => void;
    const started = new Promise<void>((resolve) => (taskStarted = resolve));
    const chunks: string[] = [];
    const rendering = renderToStream(
      async (_props, ctx) => {
        const descriptionId = useSignal('initial-id');
        const nodeId = ctx.nextId();
        const description = renderSsrAttr(
          createSsrElementTarget(nodeId),
          'aria-describedby',
          descriptionId
        );
        useTask(
          () =>
            new Promise<void>((resolve) => {
              taskStarted();
              resolveTask = () => {
                descriptionId.value = 'final-id';
                resolve();
              };
            })
        );
        return createSsrElementRecord(
          'input',
          '<input q:id="',
          createSsrNodeId(nodeId),
          `" aria-describedby="${description}">`
        );
      },
      {
        containerTagName: 'div',
        stream: { write: (chunk) => void chunks.push(chunk) },
      }
    );

    await started;
    await Promise.resolve();
    await Promise.resolve();
    const initialWasStreamed = chunks.join('').includes('aria-describedby="initial-id"');
    const patchWasStreamed = chunks.join('').includes(FINAL_ATTRIBUTE_PATCH);
    resolveTask();
    await rendering;

    expect(initialWasStreamed).toBe(true);
    expect(patchWasStreamed).toBe(false);
    expect(chunks.join('')).toContain(FINAL_ATTRIBUTE_PATCH);
  });

  test('backpatches a Promise attribute without a task', async () => {
    let resolveTitle!: (value: string) => void;
    const pending = new Promise<string>((resolve) => (resolveTitle = resolve));
    const { chunks, written: shellWritten, stream } = captureStreamUntil('<input q:id="0">');
    const rendering = renderToStream(
      async (_props, ctx) => {
        const nodeId = ctx.nextId();
        const title = await renderSsrAttrExpression(
          createSsrElementTarget(nodeId),
          'title',
          [],
          createQRL('', 'title', () => pending, null, null)
        );
        return createSsrElementRecord(
          'input',
          '<input q:id="',
          createSsrNodeId(nodeId),
          '"',
          title === null ? '' : ` title="${title}"`,
          '>'
        );
      },
      {
        stream,
      }
    );

    await shellWritten;
    expect(chunks.join('')).not.toContain('[0,"title","final-title"]');
    resolveTitle('final-title');
    await rendering;
    expect(chunks.join('')).toContain('[0,"title","final-title"]');
  });

  test('streams each Promise attribute patch as soon as it resolves', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const first = new Promise<string>((resolve) => (resolveFirst = resolve));
    const second = new Promise<string>((resolve) => (resolveSecond = resolve));
    const { chunks, written: shellWritten, stream } = captureStreamUntil('<input q:id="1">');
    const rendering = renderToStream(
      (_props, ctx) => {
        const firstId = ctx.nextId();
        const secondId = ctx.nextId();
        const firstTitle = renderSsrAttrExpression(
          createSsrElementTarget(firstId),
          'title',
          [],
          createQRL('', 'firstTitle', () => first, null, null)
        ) as string | null;
        const secondTitle = renderSsrAttrExpression(
          createSsrElementTarget(secondId),
          'title',
          [],
          createQRL('', 'secondTitle', () => second, null, null)
        ) as string | null;
        return [
          createSsrElementRecord(
            'input',
            '<input q:id="',
            createSsrNodeId(firstId),
            '"',
            firstTitle === null ? '' : ` title="${firstTitle}"`,
            '>'
          ),
          createSsrElementRecord(
            'input',
            '<input q:id="',
            createSsrNodeId(secondId),
            '"',
            secondTitle === null ? '' : ` title="${secondTitle}"`,
            '>'
          ),
        ];
      },
      {
        stream,
      }
    );

    await shellWritten;
    resolveSecond('second');
    await vi.waitFor(() => {
      expect(chunks.join('')).toContain('[1,"title","second"]');
    });
    expect(chunks.join('')).not.toContain('[0,"title","first"]');

    resolveFirst('first');
    await rendering;
    expect(chunks.join('')).toContain('[0,"title","first"]');
  });

  test('keeps the latest attribute patch while an earlier value resolves', async () => {
    let resolvePending!: (value: string) => void;
    const pending = new Promise<string>((resolve) => (resolvePending = resolve));
    const { read, rendering, setFinal } = renderPendingAttribute(pending);

    await read;
    setFinal();
    resolvePending('stale-id');
    const result = await rendering;

    expect(result.html).toContain(FINAL_ATTRIBUTE_PATCH);
    expect(result.html).not.toContain('stale-id');
  });

  test('does not wait for a superseded attribute Promise', async () => {
    const pending = new Promise<string>(() => {});
    const { read, rendering, setFinal } = renderPendingAttribute(pending);

    await read;
    setFinal();
    const result = await rendering;

    expect(result.html).toContain(FINAL_ATTRIBUTE_PATCH);
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

  test('writes fallback while Suspense content waits on a task', async () => {
    let markTaskStarted!: () => void;
    const taskStarted = new Promise<void>((resolve) => (markTaskStarted = resolve));
    let resolveTask!: () => void;
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            () => {
              useTask(
                () =>
                  new Promise<void>((resolve) => {
                    markTaskStarted();
                    resolveTask = resolve;
                  })
              );
              return '<p>content</p>';
            },
            null,
            null
          ),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        ),
      {
        containerTagName: 'div',
        stream: { write: (chunk) => void chunks.push(chunk) },
      }
    );

    await taskStarted;
    await Promise.resolve();
    const shell = chunks.join('');
    resolveTask();
    await rendering;

    expect(shell).toContain('<p>fallback</p>');
    expect(shell).not.toContain('<p>content</p>');
    expect(chunks.join('')).toContain('<template q:s="0"><p>content</p></template>');
  });

  test('fails pending Suspense content when its task rejects', async () => {
    let rejectTask!: (error: Error) => void;
    let markTaskStarted!: () => void;
    const taskStarted = new Promise<void>((resolve) => (markTaskStarted = resolve));
    const content = new Promise<string>(() => {});
    const error = new Error('task failed');

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            () => {
              useTask(
                () =>
                  new Promise<void>((_resolve, reject) => {
                    markTaskStarted();
                    rejectTask = reject;
                  })
              );
              return content;
            },
            null,
            null
          ),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        ),
      {
        containerTagName: 'div',
        stream: { write: () => {} },
      }
    );

    await taskStarted;
    rejectTask(error);

    await expect(rendering).rejects.toBe(error);
  });

  test('holds a deferred patch until its target packet is written', async () => {
    let resolveContent!: () => void;
    const content = new Promise<void>((resolve) => (resolveContent = resolve));
    let markTaskStarted!: () => void;
    const taskStarted = new Promise<void>((resolve) => (markTaskStarted = resolve));
    let resolveTask!: () => void;
    let targetId!: number;
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            (contentCtx) =>
              _await(content).then((resume) => {
                resume();
                const title = useSignal('initial');
                targetId = contentCtx.nextId();
                const value = renderSsrAttr(createSsrElementTarget(targetId), 'title', title);
                useTask(
                  () =>
                    new Promise<void>((resolve) => {
                      markTaskStarted();
                      resolveTask = () => {
                        title.value = 'final';
                        resolve();
                      };
                    })
                );
                return createSsrElementRecord(
                  'input',
                  '<input q:id="',
                  createSsrNodeId(targetId),
                  `" title="${value}">`
                );
              }),
            null,
            null
          ),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        ),
      {
        containerTagName: 'div',
        stream: { write: (chunk) => void chunks.push(chunk) },
      }
    );

    resolveContent();
    await taskStarted;
    resolveTask();
    await rendering;

    const html = chunks.join('');
    const target = `<input q:id="${targetId}" title="initial">`;
    const patch = `[${targetId},"title","final"]`;
    expect(html.indexOf(target)).toBeLessThan(html.indexOf(patch));
  });

  test('backpatches a Promise attribute in deferred content', async () => {
    let resolveTitle!: (value: string) => void;
    const content = Promise.resolve();
    const title = new Promise<string>((resolve) => (resolveTitle = resolve));
    let targetId!: number;
    const { chunks, written: shellWritten, stream } = captureStreamUntil('fallback');

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            (contentCtx) =>
              _await(content).then((resume) => {
                resume();
                targetId = contentCtx.nextId();
                const value = renderSsrAttrExpression(
                  createSsrElementTarget(targetId),
                  'title',
                  [],
                  createQRL('', 'title', () => title, null, null)
                );
                return createSsrElementRecord(
                  'input',
                  '<input q:id="',
                  createSsrNodeId(targetId),
                  value === null ? '">' : `" title="${value}">`
                );
              }),
            null,
            null
          ),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        ),
      {
        containerTagName: 'div',
        stream,
      }
    );

    await shellWritten;
    await vi.waitFor(() => expect(chunks.join('')).toContain(`<input q:id="${targetId}">`));
    expect(chunks.join('')).not.toContain(`[${targetId},"title","final"]`);

    resolveTitle('final');
    await rendering;
    const html = chunks.join('');
    const target = `<input q:id="${targetId}">`;
    const patch = `[${targetId},"title","final"]`;
    expect(html).toContain(patch);
    expect(html.indexOf(target)).toBeLessThan(html.indexOf(patch));
  });

  test('streams a shell patch while another boundary is pending', async () => {
    let resolveTitle!: (value: string) => void;
    let resolveContent!: (value: string) => void;
    const title = new Promise<string>((resolve) => (resolveTitle = resolve));
    const content = new Promise<string>((resolve) => (resolveContent = resolve));
    const { chunks, written: shellWritten, stream } = captureStreamUntil('fallback');

    const rendering = renderToStream(
      (_props, ctx) => {
        const targetId = ctx.nextId();
        const value = renderSsrAttrExpression(
          createSsrElementTarget(targetId),
          'title',
          [],
          createQRL('', 'title', () => title, null, null)
        );
        return [
          createSsrElementRecord(
            'input',
            '<input q:id="',
            createSsrNodeId(targetId),
            value === null ? '">' : `" title="${value}">`
          ),
          createSsrSuspense(
            ctx,
            ctx.nextId(),
            createQRL('', 'content', () => content, null, null),
            createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
          ) as SsrOutput,
        ];
      },
      {
        containerTagName: 'div',
        stream,
      }
    );

    await shellWritten;
    resolveTitle('final');
    await vi.waitFor(() => expect(chunks.join('')).toContain('[0,"title","final"]'));
    expect(chunks.join('')).not.toContain('<p>content</p>');

    resolveContent('<p>content</p>');
    await rendering;
  });

  test('fails a patch write while another boundary is pending', async () => {
    let resolveTitle!: (value: string) => void;
    const title = new Promise<string>((resolve) => (resolveTitle = resolve));
    const content = new Promise<string>(() => {});
    let markShellWritten!: () => void;
    const shellWritten = new Promise<void>((resolve) => (markShellWritten = resolve));
    const error = new Error('patch write failed');

    const rendering = renderToStream(
      (_props, ctx) => {
        const targetId = ctx.nextId();
        renderSsrAttrExpression(
          createSsrElementTarget(targetId),
          'title',
          [],
          createQRL('', 'title', () => title, null, null)
        );
        return [
          createSsrElementRecord('input', '<input q:id="', createSsrNodeId(targetId), '">'),
          createSsrSuspense(
            ctx,
            ctx.nextId(),
            createQRL('', 'content', () => content, null, null),
            createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
          ) as SsrOutput,
        ];
      },
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            if (chunk.includes('fallback')) {
              markShellWritten();
            }
            if (chunk.includes('_qwikB')) {
              return Promise.reject(error);
            }
          },
        },
      }
    );

    await shellWritten;
    resolveTitle('final');

    await expect(rendering).rejects.toBe(error);
  });

  test('flushes blocking tasks before a deferred packet', async () => {
    let resolveContent!: () => void;
    let resolveTask!: () => void;
    const content = new Promise<void>((resolve) => (resolveContent = resolve));
    let markTaskStarted!: () => void;
    const taskStarted = new Promise<void>((resolve) => (markTaskStarted = resolve));
    const { chunks, written: shellWritten, stream } = captureStreamUntil('fallback');

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrSuspense(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            () =>
              _await(content).then((resume) => {
                resume();
                useTask(
                  () =>
                    new Promise<void>((resolve) => {
                      markTaskStarted();
                      resolveTask = resolve;
                    })
                );
                return '<p>content</p>';
              }),
            null,
            null
          ),
          createQRL('', 'fallback', () => '<p>fallback</p>', null, null)
        ),
      {
        containerTagName: 'div',
        stream,
      }
    );

    await shellWritten;
    resolveContent();
    await taskStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chunks.join('')).not.toContain('<p>content</p>');

    resolveTask();
    await rendering;
    expect(chunks.join('')).toContain('<p>content</p>');
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
          },
        },
      }
    );

    await shell;
    resolveSecond('second content');
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

  test('stops shell writes when a task rejects under backpressure', async () => {
    let rejectTask!: (error: Error) => void;
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => (releaseWrite = resolve));
    let markWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => (markWriteStarted = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      () => {
        useTask(() => new Promise<void>((_resolve, reject) => (rejectTask = reject)));
        return '<p>content</p>';
      },
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunks.length === 1) {
              markWriteStarted();
              return blockedWrite;
            }
          },
        },
      }
    );

    await writeStarted;
    const error = new Error('task failed');
    rejectTask(error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseWrite();

    await expect(rendering).rejects.toBe(error);
    expect(chunks).toHaveLength(1);
  });

  test('cancels fallback-owned boundaries when fallback is removed', async () => {
    let resolveOuter!: (value: string) => void;
    const outer = new Promise<string>((resolve) => (resolveOuter = resolve));
    const inner = new Promise<void>(() => {});
    let resolveTitle!: (value: string) => void;
    const title = new Promise<string>((resolve) => (resolveTitle = resolve));
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
                createQRL(
                  '',
                  'inner',
                  (innerCtx) => {
                    const targetId = innerCtx.nextId();
                    const value = renderSsrAttrExpression(
                      createSsrElementTarget(targetId),
                      'title',
                      [],
                      createQRL('', 'title', () => title, null, null)
                    );
                    return inner.then(() =>
                      createSsrElementRecord(
                        'input',
                        '<input q:id="',
                        createSsrNodeId(targetId),
                        value === null ? '">' : `" title="${value}">`
                      )
                    );
                  },
                  null,
                  null
                ),
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
    resolveTitle('stale-title');
    await Promise.resolve();
    await Promise.resolve();
    expect(chunks.join('')).not.toContain('stale-title');
    resolveOuter('outer content');
    await rendering;

    expect(chunks.join('')).toContain('outer content');
    expect(chunks.join('')).not.toContain('inner content');
    expect(chunks.join('')).not.toContain('stale-title');
    expect(chunks.join('')).toMatch(/disposeRoot\(r\)/);
    expect(chunks.join('').endsWith('</div>')).toBe(true);
  });
});

function captureStreamUntil(fragment: string) {
  const chunks: string[] = [];
  let markWritten!: () => void;
  const written = new Promise<void>((resolve) => (markWritten = resolve));
  return {
    chunks,
    written,
    stream: {
      write(chunk: string) {
        chunks.push(chunk);
        if (chunk.includes(fragment)) {
          markWritten();
        }
      },
    },
  };
}

function renderPendingAttribute(pending: Promise<string>) {
  let descriptionId!: ReturnType<typeof useSignal<string | Promise<string>>>;
  let markRead!: () => void;
  const read = new Promise<void>((resolve) => (markRead = resolve));
  const originalThen = pending.then.bind(pending);
  pending.then = ((...args: Parameters<typeof pending.then>) => {
    markRead();
    return originalThen(...args);
  }) as typeof pending.then;
  const rendering = renderToString(
    (_props, ctx) => {
      descriptionId = useSignal<string | Promise<string>>('initial-id');
      const nodeId = ctx.nextId();
      const description = renderSsrAttr(
        createSsrElementTarget(nodeId),
        'aria-describedby',
        descriptionId
      );
      useTask(() => {
        descriptionId.value = pending;
      });
      return createSsrElementRecord(
        'input',
        '<input q:id="',
        createSsrNodeId(nodeId),
        `" aria-describedby="${description}">`
      );
    },
    { containerTagName: 'div' }
  );
  return {
    read,
    rendering,
    setFinal: () => (descriptionId.value = 'final-id'),
  };
}
