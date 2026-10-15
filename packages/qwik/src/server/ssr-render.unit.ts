import { describe, expect, test, vi } from 'vitest';
import {
  createQRL,
  SerializerSignal,
  registerSubscriberToOwner,
  _qrlSync,
  inlinedQrl,
  _markComponent,
  _val,
  createSsrNodeId,
  createSsrOpenTag,
  createSsrSection,
  createSsrMarkup,
  useContextProvider,
  getActiveInvokeContext,
  useTask,
  getLocale,
  useServerData,
  useSignal,
  useComputed,
  useStyles,
  createComponent,
  renderSsrTextExpression,
  renderSsrProps,
  renderSsrEvent,
  renderSsrBranch,
  renderSsrCollection,
  useComputedQrl,
  useOnDocument,
  useOn,
  renderSsrDynamicContent,
  createSsrPending,
  createSsrCatch,
  createRevealGroup,
  _await,
  renderSsrAttr,
  renderSsrAttrExpression,
  renderSsrTextNode,
  type ContextId,
  type ContextScope,
  type SsrOutput,
  type SsrReferenceChunk,
  type SsrRangeHost,
} from '@qwik.dev/core';
import {
  renderToStreamCompiled as renderToStream,
  renderToStringCompiled as renderToString,
  renderToString as publicRenderToString,
  type SsrRenderContext,
  type SsrRenderRoot,
} from './ssr-render';

const FINAL_ATTRIBUTE_PATCH = '[0,"aria-describedby","final-id"]';

const maybeThenAll = (parts: unknown[]) => Promise.all(parts) as Promise<SsrOutput[]> as never;

describe('SSR context markers', () => {
  test.each(['task-sync', 'task-async', 'computed-sync', 'computed-async'])(
    'routes %s cleanup errors to Catch and finishes remaining cleanups',
    async (kind) => {
      const cleaned: string[] = [];
      const result = await renderToString((_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'cleanup-body', () => {
            const fail = () => {
              if (kind.endsWith('async')) {
                return Promise.reject(new Error('cleanup failed'));
              }
              throw new Error('cleanup failed');
            };
            if (kind.startsWith('task')) {
              useTask(({ cleanup }) => cleanup(fail));
            } else {
              useComputed(({ cleanup }) => {
                cleanup(fail);
                return 1;
              }).value;
            }
            useTask(({ cleanup }) =>
              cleanup(() => {
                cleaned.push('tail');
              })
            );
            return '<p>body</p>';
          }),
          createQRL('', 'cleanup-fallback', () => '<p>cleanup-fallback</p>')
        )
      );
      expect(result.html).toContain('<p>cleanup-fallback</p>');
      expect(cleaned).toEqual(['tail']);
    }
  );

  test('recovers a Catch capture getter failure without serializing discarded roots', async () => {
    let isPublished = false;
    const captured = {
      secret: 'PRIVATE_DISCARDED_CAPTURE',
      get value() {
        if (isPublished) {
          throw new Error('capture getter failed');
        }
        return 1;
      },
    };
    const chunks: string[] = [];
    await renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'getter-body', (scope: SsrRangeHost) => {
            const parameter = scope.addRoot('PRIVATE_SCALAR_CAPTURE');
            return createSsrMarkup(
              '<button q:p="',
              parameter,
              '"',
              ...(scope as SsrRenderContext).eventAttrParts(
                'q-e:click',
                createQRL('', 'getter-click', () => {}, null, [captured, 'PRIVATE_SCALAR_CAPTURE'])
              ),
              '>original</button>'
            );
          }),
          createQRL('', 'getter-fallback', () => '<p>getter-fallback</p>')
        ),
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('>original</button>')) {
              isPublished = true;
            }
          },
        },
      }
    );
    expect(chunks.join('')).toContain('getter-fallback');
    expect(chunks.join('')).not.toContain('PRIVATE_DISCARDED_CAPTURE');
    expect(chunks.join('')).not.toContain('PRIVATE_SCALAR_CAPTURE');
  });

  test('cleans deferred owners without rescanning unrelated ranges', async () => {
    const reads = vi.fn();
    const releases: Array<() => void> = [];
    let next = 0;
    await renderToStream(
      (_props, ctx) => {
        const createScope = ctx.createRangeScope;
        ctx.createRangeScope = function (rangeId) {
          const scope = createScope.call(this, rangeId);
          const defer = scope.defer;
          scope.defer = (range, output) => {
            const content = (range.contentRoot as { content: { currentOwner: unknown } }).content;
            let owner = content.currentOwner;
            Object.defineProperty(content, 'currentOwner', {
              get() {
                reads();
                return owner;
              },
              set(value) {
                owner = value;
              },
            });
            defer(range, output);
          };
          return scope;
        };
        return maybeThenAll(
          Array.from({ length: 20 }, () =>
            createSsrPending(
              ctx,
              ctx.nextId(),
              createQRL('', 'cleanup-content', () => {
                useTask(() => {});
                return new Promise<string>((resolve) =>
                  releases.push(() => resolve('<p>ready</p>'))
                );
              }),
              createQRL('', 'cleanup-placeholder', () => '<p>waiting</p>')
            )
          )
        );
      },
      {
        stream: {
          write(chunk) {
            if (
              chunk.includes('w._qwikS=') ||
              chunk.includes('window._qwikS(document.currentScript,')
            ) {
              releases[next++]?.();
            }
          },
        },
      }
    );
    expect(next).toBe(21);
    expect(reads.mock.calls.length).toBeLessThanOrEqual(120);
  });

  test.each([false, true])(
    'keeps authored Catch document sections behind flat markers: %s',
    async (flatMarkers) => {
      const result = await renderToString((_props, ctx) => {
        const document = createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'document-body', () => [
            createSsrSection('head', '<head', '>'),
            '<title>Catch document</title>',
            createSsrSection('/head', '</head>'),
            createSsrSection('body', '<body', '>'),
            '<p>document-content</p>',
            createSsrSection('/body', '</body>'),
          ]),
          createQRL('', 'document-fallback', () => '<p>document-fallback</p>')
        );
        return flatMarkers
          ? ['<!b=', createSsrNodeId(ctx.nextId()), '>', ctx.observeError(document), '<!/b>']
          : document;
      });
      expect(result.html.match(/<head(?:\s|>)/g)).toHaveLength(1);
      expect(result.html.match(/<body>/g)).toHaveLength(1);
      expect(result.html).toMatch(/<head[^>]*><title>Catch document<\/title><\/head>/);
      expect(result.html.indexOf('<script type="qwik/state"')).toBeLessThan(
        result.html.indexOf('</body>')
      );
      expect(result.html.indexOf('<!d=')).toBeGreaterThan(result.html.indexOf('<body>'));
      expect(result.html.indexOf('<!/d>')).toBeLessThan(result.html.indexOf('</body>'));
    }
  );

  test('rolls back sync definitions from an unvisited nested Catch', async () => {
    let rejectFirst!: (error: Error) => void;
    let rejectSecond!: (error: Error) => void;
    let releasePrefix!: () => void;
    let prefixStarted!: () => void;
    let releaseFallback!: (output: string) => void;
    let fallbackStarted!: () => void;
    const first = new Promise<string>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const second = new Promise<string>((_resolve, reject) => {
      rejectSecond = reject;
    });
    const prefix = new Promise<void>((resolve) => {
      releasePrefix = resolve;
    });
    const writingPrefix = new Promise<void>((resolve) => {
      prefixStarted = resolve;
    });
    const fallback = new Promise<string>((resolve) => {
      releaseFallback = resolve;
    });
    const renderingFallback = new Promise<void>((resolve) => {
      fallbackStarted = resolve;
    });
    const chunks: string[] = [];
    const handler = _qrlSync(() => {}, 'nested_sync', '()=>"PRIVATE_NESTED_SYNC"');
    const rendering = renderToStream(
      (_props, ctx) =>
        maybeThenAll([
          '<p>blocked-prefix</p>',
          createSsrCatch(
            ctx,
            ctx.nextId(),
            createQRL('', 'outer', (scope: SsrRangeHost) =>
              maybeThenAll([
                createSsrCatch(
                  scope,
                  scope.nextId(),
                  createQRL('', 'first', (child: SsrRangeHost) =>
                    createSsrPending(
                      child,
                      child.nextId(),
                      createQRL('', 'first-wait', () => first)
                    )
                  ),
                  createQRL('', 'first-fallback', () => {
                    fallbackStarted();
                    return fallback;
                  })
                ),
                createSsrCatch(
                  scope,
                  scope.nextId(),
                  createQRL('', 'second', (child: SsrRangeHost) =>
                    maybeThenAll([
                      createSsrMarkup(
                        '<button',
                        ...(child as SsrRenderContext).eventAttrParts('q-e:click', handler),
                        '>private-button</button>'
                      ),
                      createSsrPending(
                        child,
                        child.nextId(),
                        createQRL('', 'second-wait', () => second)
                      ),
                    ])
                  ),
                  createQRL('', 'second-fallback', () => '<p>safe-second</p>')
                ),
              ])
            ),
            createQRL('', 'outer-fallback', () => '<p>safe-outer</p>')
          ),
        ]),
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('blocked-prefix')) {
              prefixStarted();
              return prefix;
            }
          },
        },
      }
    );
    await writingPrefix;
    rejectFirst(new Error('first failure'));
    await renderingFallback;
    releasePrefix();
    await new Promise<void>((resolve) => setImmediate(resolve));
    rejectSecond(new Error('second failure'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseFallback('<p>safe-first</p>');
    await rendering;
    const html = chunks.join('');
    expect(html).toContain('safe-first');
    expect(html).toContain('safe-second');
    expect(html).not.toContain('private-button');
    expect(html).not.toContain('PRIVATE_NESTED_SYNC');
  });

  test('attaches useOn to a late Catch fallback after empty initial output', async () => {
    let reject!: (error: Error) => void;
    const waiting = new Promise<string>((_resolve, fail) => {
      reject = fail;
    });
    const chunks: string[] = [];
    await renderToStream(
      (_props, ctx) =>
        createComponent(
          () => {
            useOn(
              'click',
              createQRL('', 'late-click', () => {})
            );
            useOnDocument(
              'click',
              createQRL('', 'document-click', () => {})
            );
            return createSsrCatch(
              ctx,
              ctx.nextId(),
              createQRL('', 'empty-body', (scope: SsrRangeHost) =>
                createSsrPending(
                  scope,
                  scope.nextId(),
                  createQRL('', 'empty-wait', () => waiting)
                )
              ),
              createQRL('', 'button-fallback', () => [
                createSsrOpenTag('<button id="late-button"', '>'),
                'fallback</button>',
              ])
            ) as never;
          },
          null,
          ctx,
          { container: ctx as never }
        ),
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('w._qwikS=')) {
              queueMicrotask(() => reject(new Error('late failure')));
            }
          },
        },
      }
    );
    expect(chunks.join('')).toMatch(/<button id="late-button" q-e:click="[^"]*late-click/);
    expect(chunks.join('').match(/q-d:click=/g)).toHaveLength(1);
  });

  test('streams many style and eager resume packets without scanning their history', async () => {
    const releases: Array<() => void> = [];
    const emissions: Array<() => void> = [];
    const delivered = Array.from(
      { length: 20 },
      () => new Promise<void>((resolve) => emissions.push(resolve))
    );
    const chunks: string[] = [];
    let shellDone!: () => void;
    const shell = new Promise<void>((resolve) => {
      shellDone = resolve;
    });
    let styles!: ReturnType<typeof vi.spyOn>;
    let eager!: ReturnType<typeof vi.spyOn>;
    const rendering = renderToStream(
      (_props, ctx) => {
        styles = vi.spyOn(ctx.styleIds, Symbol.iterator);
        eager = vi.spyOn(ctx.serializationCtx.$eagerResume$, Symbol.iterator);
        return Promise.all(
          Array.from({ length: 20 }, (_, index) =>
            createSsrPending(
              ctx,
              ctx.nextId(),
              createQRL('', 'metadata-body', () => {
                useStyles('.packet-' + index + '{}', 'packet-' + index);
                const value = useComputedQrl(
                  createQRL('', 'metadata-compute', () => 17),
                  { initial: 1, clientOnly: true }
                );
                value.value;
                return new Promise<string>((resolve) => {
                  releases.push(() => resolve('<p>packet-' + index + '</p>'));
                });
              }),
              createQRL('', 'metadata-placeholder', () => '<p>waiting</p>')
            )
          )
        );
      },
      {
        instanceHash: 'metadata-test',
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('w._qwikS=')) {
              shellDone();
            }
            if (chunk.includes('window._qwikS(document.currentScript,')) {
              const index = Number(/<p>packet-(\d+)<\/p>/.exec(chunk)![1]);
              expect(chunk).toContain(`q:style="packet-${index}"`);
              expect(chunk).toContain('q:idle=');
              expect(chunk).toContain('_res');
              expect((chunk.match(/<style/g) ?? []).length).toBe(1);
              emissions[index]();
            }
          },
        },
      }
    );
    await shell;
    styles.mockClear();
    eager.mockClear();
    for (let index = 19; index >= 0; index--) {
      releases[index]();
      await delivered[index];
    }
    await rendering;
    expect(styles).not.toHaveBeenCalled();
    expect(eager).not.toHaveBeenCalled();
    expect(
      chunks.filter((chunk) => chunk.includes('window._qwikS(document.currentScript,'))
    ).toHaveLength(20);
    styles.mockRestore();
    eager.mockRestore();
  });

  test('publishes roots registered before and after a native await', async () => {
    const result = await renderToString(async (_props, ctx) => {
      ctx.addRoot('before-await-state');
      await Promise.resolve();
      ctx.addRoot('after-await-state');
      return '<p>ready</p>';
    });
    expect(result.html).toContain('before-await-state');
    expect(result.html).toContain('after-await-state');
  });

  test('keeps Catch fragment order across buffered blocks', async () => {
    const fragments = Array.from({ length: 1000 }, (_, index) => ['<i>', String(index), '</i>']);
    const result = await renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'fragment-body', () => fragments),
        createQRL('', 'fragment-fallback', () => 'unexpected-fallback')
      )
    );
    expect(result.html).toContain(fragments.flat().join(''));
    expect(result.html).not.toContain('unexpected-fallback');
  });

  test('discards buffered Catch blocks when late metadata materialization fails', async () => {
    const fn = () => {};
    const handler = createQRL('', 'late-frame-metadata', fn);
    Object.defineProperty(fn, 'serialized', {
      get() {
        throw new Error('late metadata error');
      },
    });
    const result = await renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'buffered-body', (scope: SsrRangeHost) => [
          Array.from({ length: 1000 }, () => ['<i>', 'PRIVATE_BUFFERED_BLOCK', '</i>']),
          (scope as SsrRenderContext).syncFn(handler),
        ]),
        createQRL('', 'buffered-fallback', () => 'safe-buffered-fallback')
      )
    );
    expect(result.html).toContain('safe-buffered-fallback');
    expect(result.html).not.toContain('PRIVATE_BUFFERED_BLOCK');
  });

  test.skipIf(!globalThis.gc).each(['returned', 'thrown', 'nested', 'async-nested'] as const)(
    'releases a response after its discarded %s render Promise settles',
    async (kind) => {
      let resolve!: (output: string) => void;
      const pending = new Promise<string>((done) => {
        resolve = done;
      });
      let weak!: WeakRef<SsrRenderContext>;
      const chunks: string[] = [];
      const rendering = renderToStream(
        (_props, ctx) => {
          weak = new WeakRef(ctx);
          return createSsrCatch(
            ctx,
            ctx.nextId(),
            createQRL('', 'pendingContent', (scope: SsrRangeHost) => {
              const cancel = () => {
                void scope.catchBoundary!.catchError(new Error('abandon render'));
              };
              if (kind === 'async-nested') {
                let queued = false;
                return Promise.resolve(
                  new Proxy(['discarded-prefix', pending], {
                    get(target, key, receiver) {
                      if (key === '0' && !queued) {
                        queued = true;
                        queueMicrotask(cancel);
                      }
                      return Reflect.get(target, key, receiver);
                    },
                  })
                );
              }
              queueMicrotask(cancel);
              if (kind === 'thrown') {
                throw pending;
              }
              return kind === 'nested' ? ['discarded-prefix', pending] : pending;
            }),
            createQRL('', 'fallback', () => 'collected-fallback')
          );
        },
        {
          stream: {
            write(chunk) {
              chunks.push(chunk);
            },
          },
        }
      );
      await new Promise<void>((done) => setImmediate(done));
      resolve('PRIVATE_ABANDONED_RENDER');
      await rendering;
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((done) => setImmediate(done));
        globalThis.gc!();
      }
      expect(weak.deref()).toBeUndefined();
      expect(chunks.join('')).toContain('collected-fallback');
      expect(chunks.join('')).not.toContain('PRIVATE_ABANDONED_RENDER');
    }
  );

  test('bounds retries of a Promise rejected with itself', async () => {
    let reject!: (error: unknown) => void;
    const pending = new Promise<void>((_done, fail) => {
      reject = fail;
    });
    reject(pending);
    const result = await renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'retrying', () => {
          throw pending;
        }),
        createQRL('', 'fallback', (_ctx, error) => (error as Error).message)
      )
    );
    expect(result.html).toContain('Exceeded max retry count');
  });

  test('does not restore a discarded lane patch after frame preparation is cancelled', async () => {
    let resolveContent!: () => void;
    let resolvePatch!: (value: string) => void;
    const content = new Promise<void>((done) => {
      resolveContent = done;
    });
    const patch = new Promise<string>((done) => {
      resolvePatch = done;
    });
    let lane!: SsrRenderContext['scheduler'];
    const { chunks, written, stream } = captureStreamUntil('discarded-patch-placeholder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'body', (scope: SsrRangeHost) =>
            createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'content', (host: SsrRangeHost) => {
                lane = (host as SsrRenderContext).scheduler;
                const takePatches = lane.takePatches.bind(lane);
                vi.spyOn(lane, 'takePatches').mockImplementation((journal) => {
                  const patches = takePatches(journal);
                  if (journal !== undefined && patches !== null) {
                    void host.catchBoundary!.catchError(new Error('cancel prepared frame'));
                  }
                  return patches;
                });
                const id = host.nextId();
                renderSsrAttrExpression(
                  id,
                  'title',
                  [],
                  createQRL('', 'title', () => patch)
                );
                return content.then(() => `<input q:id="${id}" id="discarded-input">`);
              }),
              createQRL('', 'placeholder', () => 'discarded-patch-placeholder')
            )
          ),
          createQRL('', 'fallback', () => 'discarded-patch-fallback')
        ),
      { stream }
    );
    await written;
    resolvePatch('PRIVATE_DISCARDED_PATCH');
    await lane.settle();
    resolveContent();
    await rendering;
    expect(chunks.join('')).toContain('discarded-patch-fallback');
    expect(chunks.join('')).not.toContain('discarded-input');
    expect(chunks.join('')).not.toContain('PRIVATE_DISCARDED_PATCH');
  });

  test('does not restore a cancelled child patch through its live parent lane', async () => {
    let release!: () => void;
    let parentPatch!: (value: string) => void;
    let childPatch!: (value: string) => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const parentValue = new Promise<string>((resolve) => {
      parentPatch = resolve;
    });
    const childValue = new Promise<string>((resolve) => {
      childPatch = resolve;
    });
    let parentLane!: SsrRenderContext['scheduler'];
    let childLane!: SsrRenderContext['scheduler'];
    const { chunks, written, stream } = captureStreamUntil('parent-patch-placeholder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL('', 'parent', (host: SsrRangeHost) => {
            parentLane = (host as SsrRenderContext).scheduler;
            const parentId = host.nextId();
            renderSsrAttrExpression(
              parentId,
              'title',
              [],
              createQRL('', 'parent-title', () => parentValue)
            );
            const child = createSsrCatch(
              host,
              host.nextId(),
              createQRL('', 'child-catch', (childHost: SsrRangeHost) => {
                childLane = (childHost as SsrRenderContext).scheduler;
                const original = childLane.takePatches.bind(childLane);
                vi.spyOn(childLane, 'takePatches').mockImplementation((journal) => {
                  const patches = original(journal);
                  if (journal !== undefined && patches !== null) {
                    void childHost.catchBoundary!.catchError(new Error('cancel child frame'));
                  }
                  return patches;
                });
                const childId = childHost.nextId();
                renderSsrAttrExpression(
                  childId,
                  'title',
                  [],
                  createQRL('', 'child-title', () => childValue)
                );
                return pending.then(() => `<input q:id="${childId}" id="cancelled-child-input">`);
              }),
              createQRL('', 'child-fallback', () => 'cancelled-child-fallback')
            );
            return pending.then(() =>
              maybeThenAll([`<input q:id="${parentId}" id="live-parent-input">`, child])
            );
          }),
          createQRL('', 'parent-placeholder', () => 'parent-patch-placeholder')
        ),
      { stream }
    );
    await written;
    parentPatch('PUBLIC_PARENT_PATCH');
    childPatch('PRIVATE_CANCELLED_CHILD_PATCH');
    await parentLane.settle();
    await childLane.settle();
    release();
    await rendering;
    expect(chunks.join('')).toContain('cancelled-child-fallback');
    expect(chunks.join('')).toContain('PUBLIC_PARENT_PATCH');
    expect(chunks.join('')).not.toContain('cancelled-child-input');
    expect(chunks.join('')).not.toContain('PRIVATE_CANCELLED_CHILD_PATCH');
  });

  test.skipIf(!globalThis.gc).each(['thrown', 'returned'] as const)(
    'releases a cancelled task after its %s Promise settles without rerunning',
    async (kind) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      let weak!: WeakRef<SsrRenderContext>;
      let runs = 0;
      const rendering = renderToString((_props, ctx) => {
        weak = new WeakRef(ctx);
        return createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'task-body', (scope: SsrRangeHost) => {
            useTask(() => {
              runs++;
              if (kind === 'thrown' && runs === 1) {
                throw pending;
              }
              return pending;
            });
            queueMicrotask(() => {
              void scope.catchBoundary!.catchError(new Error('cancel task'));
            });
            return 'discarded-task-body';
          }),
          createQRL('', 'task-fallback', () => 'cancelled-task-fallback')
        );
      });
      await new Promise<void>((done) => setImmediate(done));
      release();
      const result = await rendering;
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((done) => setImmediate(done));
        globalThis.gc!();
      }
      expect(runs).toBe(1);
      expect(weak.deref()).toBeUndefined();
      expect(result.html).toContain('cancelled-task-fallback');
      expect(result.html).not.toContain('discarded-task-body');
    }
  );

  test.each(['task', 'computed'] as const)(
    'discards frame output after the cancelled %s cleanup settles',
    async (kind) => {
      let releaseContent!: () => void;
      let releaseCleanup!: () => void;
      let rejectSibling!: (error: Error) => void;
      let started!: () => void;
      const content = new Promise<void>((resolve) => {
        releaseContent = resolve;
      });
      const cleanup = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      const sibling = new Promise<string>((_resolve, reject) => {
        rejectSibling = reject;
      });
      const cleanupStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const { chunks, written, stream } = captureStreamUntil('cleanup-placeholder');
      const rendering = renderToStream(
        (_props, ctx) =>
          createSsrCatch(
            ctx,
            ctx.nextId(),
            createQRL('', 'cleanup-body', (scope: SsrRangeHost) =>
              maybeThenAll([
                createSsrPending(
                  scope,
                  scope.nextId(),
                  createQRL('', 'cleanup-content', () => {
                    const onCleanup = () => {
                      started();
                      return cleanup;
                    };
                    if (kind === 'task') {
                      useTask(({ cleanup }) => {
                        cleanup(onCleanup);
                      });
                    } else {
                      const value = useComputed(({ cleanup }) => {
                        cleanup(onCleanup);
                        return 1;
                      });
                      value.value;
                    }
                    return content.then(() => 'discarded-cleanup-output');
                  }),
                  createQRL('', 'cleanup-placeholder', () => 'cleanup-placeholder')
                ),
                createSsrPending(
                  scope,
                  scope.nextId(),
                  createQRL('', 'cleanup-sibling', () => sibling)
                ),
              ])
            ),
            createQRL('', 'cleanup-fallback', () => 'cancelled-cleanup-fallback')
          ),
        { stream }
      );
      await written;
      releaseContent();
      await cleanupStarted;
      rejectSibling(new Error('sibling failed during cleanup'));
      await new Promise<void>((done) => setImmediate(done));
      releaseCleanup();
      await rendering;
      expect(chunks.join('')).toContain('cancelled-cleanup-fallback');
      expect(chunks.join('')).not.toContain('discarded-cleanup-output');
    }
  );

  test('keeps discarded Catch styles out of fallback HTML', async () => {
    const result = await renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'styled-error', () => {
          useStyles('.private{content:"PRIVATE_DISCARDED_STYLE"}', 'private-style');
          throw new Error('discard styles');
        }),
        createQRL('', 'style-fallback', () => {
          useStyles('.public{color:red}', 'public-style');
          return '<p class="public">style-fallback</p>';
        })
      )
    );
    expect(result.html).toContain('.public{color:red}');
    expect(result.html).not.toContain('PRIVATE_DISCARDED_STYLE');
  });

  test('keeps unselected Catch sync definitions behind its publication frame', async () => {
    let reject!: (error: Error) => void;
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    const blocked = new Promise<void>((done) => {
      release = done;
    });
    const writing = new Promise<void>((done) => {
      started = done;
    });
    const handler = _qrlSync(() => {}, 'private_sync', '()=>"PRIVATE_DISCARDED_SYNC"');
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) =>
        maybeThenAll([
          '<p id="before-sync-catch">prefix</p>',
          createSsrCatch(
            ctx,
            ctx.nextId(),
            createQRL('', 'sync-body', (scope: SsrRangeHost) =>
              maybeThenAll([
                createSsrMarkup(
                  '<button',
                  ...(scope as SsrRenderContext).eventAttrParts('q-e:click', handler),
                  '>discarded-sync-button</button>'
                ),
                createSsrPending(
                  scope,
                  scope.nextId(),
                  createQRL('', 'sync-pending', () => pending)
                ),
              ])
            ),
            createQRL('', 'sync-fallback', () => 'sync-safe-fallback')
          ),
        ]),
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('before-sync-catch')) {
              started();
              return blocked;
            }
          },
        },
      }
    );
    await writing;
    reject(new Error('discard sync before frame'));
    await new Promise<void>((done) => setImmediate(done));
    release();
    await rendering;
    expect(chunks.join('')).toContain('sync-safe-fallback');
    expect(chunks.join('')).not.toContain('discarded-sync-button');
    expect(chunks.join('')).not.toContain('PRIVATE_DISCARDED_SYNC');
  });

  test
    .skipIf(!globalThis.gc)
    .each([
      'await',
      'native-await',
      'computed-return',
      'computed-throw',
      'component-return',
      'component-throw',
    ] as const)(
    'releases cancelled %s context after its discarded input Promise settles',
    async (kind) => {
      let release!: (value: number) => void;
      const pending = new Promise<number>((done) => {
        release = done;
      });
      let weak!: WeakRef<SsrRenderContext>;
      let runs = 0;
      const runAwait = async () => {
        (await _await(pending))();
      };
      const runNativeAwait = async () => {
        await pending;
      };
      const rendering = renderToString((_props, ctx) => {
        weak = new WeakRef(ctx);
        return createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'async-producer', (scope: SsrRangeHost) => {
            queueMicrotask(() => {
              void scope.catchBoundary!.catchError(new Error('abandon producer'));
            });
            if (kind === 'await' || kind === 'native-await') {
              useTask(kind === 'await' ? runAwait : runNativeAwait);
              return 'discarded-await';
            }
            if (kind === 'component-return' || kind === 'component-throw') {
              return createComponent(() => {
                runs++;
                if (kind === 'component-throw') {
                  throw pending;
                }
                return pending.then(String);
              }, null);
            }
            const value = useComputed(() => {
              runs++;
              if (kind === 'computed-throw' && runs === 1) {
                throw pending;
              }
              return pending;
            });
            return String(value.value);
          }),
          createQRL('', 'async-safe', () => 'async-safe')
        );
      });
      await new Promise<void>((done) => setImmediate(done));
      release(17);
      await rendering;
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((done) => setImmediate(done));
        globalThis.gc!();
      }
      expect(runs).toBe(kind.endsWith('await') ? 0 : 1);
      expect(weak.deref()).toBeUndefined();
    }
  );

  test.each([
    'text',
    'attr',
    'props',
    'event',
    'component',
    'branch',
    'collection',
    'for',
  ] as const)('does not continue the cancelled %s producer', async (kind) => {
    let release!: () => void;
    const pending = new Promise<void>((done) => {
      release = done;
    });
    let runs = 0;
    const rendering = renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'producer', (scope: SsrRangeHost) => {
          queueMicrotask(() => {
            void scope.catchBoundary!.catchError(new Error('abandon output'));
          });
          const retrying = () => {
            runs++;
            if (runs === 1) {
              throw pending;
            }
            return 'late-output';
          };
          if (kind === 'text') {
            return renderSsrTextExpression(
              scope.nextId(),
              null,
              [],
              createQRL('', 'text', retrying)
            );
          }
          if (kind === 'attr') {
            return renderSsrAttrExpression(
              scope.nextId(),
              'title',
              [],
              createQRL('', 'attr', retrying)
            ) as SsrOutput;
          }
          if (kind === 'props') {
            const props = () => {
              runs++;
              if (runs === 1) {
                throw pending;
              }
              return {};
            };
            return Promise.resolve(
              renderSsrProps(scope.nextId(), [], createQRL('', 'props', props))
            ).then((result) =>
              typeof result === 'string'
                ? result
                : createSsrMarkup('<i', ...result.attrs, '>props</i>')
            );
          }
          if (kind === 'event') {
            const event = () => {
              runs++;
              if (runs === 1) {
                throw pending;
              }
              return null;
            };
            return Promise.resolve(
              renderSsrEvent(
                scope.nextId(),
                'q-e:click',
                [],
                createQRL('', 'event', event),
                (scope as SsrRenderContext).eventAttr.bind(scope)
              )
            ).then((attr) => createSsrMarkup('<button', attr, '>event</button>'));
          }
          if (kind === 'component') {
            return createComponent(retrying as never, {}) as SsrOutput;
          }
          if (kind === 'branch') {
            return renderSsrBranch(
              scope as never,
              scope.nextId(),
              createQRL('', 'condition', () => pending.then(() => true)),
              createQRL('', 'then', () => {
                runs++;
                return 'late-branch';
              }),
              undefined
            );
          }
          const rows = kind === 'for' ? useSignal([1, 2]) : [1, 2];
          return renderSsrCollection(
            scope as never,
            scope.nextId(),
            rows,
            undefined,
            createQRL('', 'row', () => {
              runs++;
              return pending.then(() => 'row');
            })
          );
        }),
        createQRL('', 'producer-safe', () => 'producer-safe')
      )
    );
    await new Promise<void>((done) => setImmediate(done));
    const beforeRelease = runs;
    release();
    await rendering;
    await new Promise<void>((done) => setImmediate(done));
    expect(runs).toBe(beforeRelease);
    if (kind === 'attr') {
      expect(beforeRelease).toBeGreaterThan(0);
    } else {
      expect(beforeRelease).toBe(kind === 'branch' ? 0 : 1);
    }
  });

  test.each(['task', 'computed'] as const)(
    'runs a cleanup registered after %s disposal',
    async (kind) => {
      let release!: () => void;
      const pending = new Promise<void>((done) => {
        release = done;
      });
      let cleaned = 0;
      const rendering = renderToString((_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'late-cleanup', (scope: SsrRangeHost) => {
            queueMicrotask(() => {
              void scope.catchBoundary!.catchError(new Error('dispose before cleanup'));
            });
            const run = async ({ cleanup }: { cleanup(callback: () => void): void }) => {
              await pending;
              cleanup(() => {
                cleaned++;
              });
              return 1;
            };
            if (kind === 'task') {
              useTask(run);
            } else {
              useComputed(run, { initial: 0 }).value;
            }
            return 'discarded-late-cleanup';
          }),
          createQRL('', 'late-cleanup-safe', () => 'late-cleanup-safe')
        )
      );
      await new Promise<void>((done) => setImmediate(done));
      release();
      await rendering;
      await new Promise<void>((done) => setImmediate(done));
      expect(cleaned).toBe(1);
    }
  );

  test('completes shell cleanup after a Pending Catch fails', async () => {
    let release!: () => void;
    let reject!: (error: Error) => void;
    let started!: () => void;
    const cleanup = new Promise<void>((done) => {
      release = done;
    });
    const began = new Promise<void>((done) => {
      started = done;
    });
    const pending = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) => {
        const value = useComputed(({ cleanup: register }) => {
          register(() => {
            started();
            return cleanup;
          });
          return 1;
        });
        value.value;
        return createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'shell-body', (scope: SsrRangeHost) =>
            createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'shell-pending', () => pending)
            )
          ),
          createQRL('', 'shell-safe', () => 'shell-safe')
        );
      },
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
          },
        },
      }
    );
    await began;
    reject(new Error('fail during shell cleanup'));
    await new Promise<void>((done) => setImmediate(done));
    release();
    await rendering;
    expect(chunks.join('')).toContain('shell-safe');
  });

  test('does not classify ordinary root data as a subscriber', async () => {
    const value = { kind: 'business', flags: 0 };
    const result = await renderToString((_props, ctx) => {
      ctx.addRoot(value);
      return '<p>business</p>';
    });
    expect(value.flags).toBe(0);
    expect(result.html).toContain('business');
    expect(result.html).not.toContain(',32');
    const frozen = Object.freeze({ kind: 0, flags: 0 });
    await expect(
      renderToString((_props, ctx) => {
        ctx.addRoot(frozen);
        return 'frozen';
      })
    ).resolves.toBeDefined();
  });

  test('captures eager resume marked after its owner publication was selected', async () => {
    const result = await renderToString((_props, ctx) => {
      const value = useComputedQrl(
        createQRL('', 'lateEager', () => 17),
        { initial: 1, clientOnly: true }
      );
      const reference: SsrReferenceChunk = {
        type: 'root-value',
        get value() {
          value.value;
          return value;
        },
      };
      return createSsrMarkup('<span q:p="', reference, '">late-read</span>');
    });
    expect(result.html).toContain('q-d:qidle=');
    expect(result.html).toContain('_res');
  });

  test('emits eager resume for clientOnly computed in an OOOS packet', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const { chunks, written, stream } = captureStreamUntil('eager-placeholder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL('', 'content', () =>
            _await(pending).then((resume) => {
              resume();
              const value = useComputed(() => 2, { initial: 1, clientOnly: true });
              value.value;
              return '<p>client-computed</p>';
            })
          ),
          createQRL('', 'placeholder', () => 'eager-placeholder')
        ),
      { stream }
    );
    await written;
    resolve();
    await rendering;
    const packet = chunks.find(
      (chunk) => chunk.includes('q:s=') && chunk.includes('client-computed')
    )!;
    expect(packet).toContain('q:idle=');
    expect(packet).toContain('_res');
  });

  test('cancels shell serialization without Catch when deferred work fails', async () => {
    let started!: () => void;
    let reject!: (error: unknown) => void;
    const encoding = new Promise<void>((done) => {
      started = done;
    });
    const pending = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    const error = new Error('fatal deferred failure');
    const rendering = renderToStream(
      (_props, ctx) => {
        const value = registerSubscriberToOwner(
          new SerializerSignal<number, unknown>(null, undefined, {
            initial: 1,
            deserialize: (value: unknown) => Number(value),
            serialize() {
              started();
              return new Promise(() => {});
            },
          })
        );
        value.value;
        ctx.addRoot(value);
        return createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL('', 'content', () => pending),
          createQRL('', 'placeholder', () => 'fatal-placeholder')
        );
      },
      { stream: { write() {} } }
    );
    await encoding;
    reject(error);
    await expect(rendering).rejects.toBe(error);
  });

  test('releases the next Reveal range when Catch cancels the first', async () => {
    let rejectFirst!: (error: unknown) => void;
    let resolveSecond!: (output: string) => void;
    const first = new Promise<string>((_done, fail) => {
      rejectFirst = fail;
    });
    const second = new Promise<string>((done) => {
      resolveSecond = done;
    });
    const { chunks, written, stream } = captureStreamUntil('reveal-first-placeholder');
    const rendering = renderToStream(
      (_props, ctx) => {
        const group = createRevealGroup('sequential', true, 2);
        return maybeThenAll([
          createSsrCatch(
            ctx,
            ctx.nextId(),
            createQRL('', 'body', (scope: SsrRangeHost) =>
              createSsrPending(
                scope,
                scope.nextId(),
                createQRL('', 'first', () => first),
                createQRL('', 'placeholder', () => 'reveal-first-placeholder'),
                0,
                group,
                0
              )
            ),
            createQRL('', 'fallback', () => 'reveal-catch-fallback')
          ),
          createSsrPending(
            ctx,
            ctx.nextId(),
            createQRL('', 'second', () => second),
            createQRL('', 'placeholder', () => 'reveal-second-placeholder'),
            0,
            group,
            1
          ),
        ]);
      },
      { stream }
    );
    await written;
    resolveSecond('reveal-independent-content');
    rejectFirst(new Error('first failed'));
    await rendering;
    expect(chunks.join('')).toContain('reveal-catch-fallback');
    expect(chunks.join('')).toContain('reveal-independent-content');
  });

  test('routes a streamed Catch fallback failure to the outer Catch', async () => {
    let reject!: (error: unknown) => void;
    const pending = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    const { chunks, written, stream } = captureStreamUntil('nested-catch-placeholder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'outerBody', (outer: SsrRangeHost) =>
            createSsrCatch(
              outer,
              outer.nextId(),
              createQRL('', 'innerBody', (inner: SsrRangeHost) =>
                createSsrPending(
                  inner,
                  inner.nextId(),
                  createQRL('', 'content', () => pending),
                  createQRL('', 'placeholder', () => 'nested-catch-placeholder')
                )
              ),
              createQRL('', 'innerFallback', (scope: unknown) => {
                (scope as SsrRangeHost).addRoot({ private: 'PRIVATE_FAILED_FALLBACK' });
                throw new Error('inner fallback failed');
              })
            )
          ),
          createQRL('', 'outerFallback', () => 'outer-catch-fallback')
        ),
      { stream }
    );
    await written;
    reject(new Error('late failure'));
    await rendering;
    expect(chunks.join('')).toContain('outer-catch-fallback');
    expect(chunks.join('')).not.toContain('PRIVATE_FAILED_FALLBACK');
  });

  test('discards a prepared frame invalidated synchronously by its encoder', async () => {
    let resolve!: (output: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const { chunks, written, stream } = captureStreamUntil('invalidated-placeholder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'body', (scope: SsrRangeHost) =>
            createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'content', (scope: SsrRangeHost) => {
                const value = registerSubscriberToOwner(
                  new SerializerSignal<number, unknown>(null, undefined, {
                    initial: 1,
                    deserialize: (value: unknown) => Number(value),
                    serialize() {
                      void scope.catchBoundary!.catchError(new Error('invalidated before write'));
                      return { private: 'PRIVATE_INVALIDATED_FRAME' };
                    },
                  })
                );
                value.value;
                scope.addRoot(value);
                return pending;
              }),
              createQRL('', 'placeholder', () => 'invalidated-placeholder')
            )
          ),
          createQRL('', 'fallback', () => 'invalidated-fallback')
        ),
      { stream }
    );
    await written;
    resolve('invalidated-content');
    await rendering;
    expect(chunks.join('')).toContain('invalidated-fallback');
    expect(chunks.join('')).not.toContain('invalidated-content');
    expect(chunks.join('')).not.toContain('PRIVATE_INVALIDATED_FRAME');
  });

  test('aborts the response on transport failure after frame commit', async () => {
    let resolve!: (output: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const error = new Error('transport failed');
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'body', (scope: SsrRangeHost) =>
            createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'content', () => pending),
              createQRL('', 'placeholder', () => 'transport-placeholder')
            )
          ),
          createQRL('', 'fallback', () => 'transport-fallback')
        ),
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('<template') && chunk.includes('transport-content')) {
              return Promise.reject(error);
            }
          },
        },
      }
    );
    resolve('transport-content');
    await expect(rendering).rejects.toBe(error);
    expect(chunks.join('')).not.toContain('transport-fallback');
  });

  test('cancels a never-settling encoder when another Pending in Catch fails', async () => {
    let startEncoding!: () => void;
    const encoding = new Promise<void>((done) => {
      startEncoding = done;
    });
    let resolveContent!: (output: string) => void;
    let rejectSibling!: (error: unknown) => void;
    let resolveEncoder!: (value: unknown) => void;
    const pending = new Promise<string>((done) => {
      resolveContent = done;
    });
    const failing = new Promise<string>((_done, fail) => {
      rejectSibling = fail;
    });
    const encoder = new Promise<unknown>((done) => {
      resolveEncoder = done;
    });
    const { chunks, written, stream } = captureStreamUntil('never-encoder-placeholder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'catchContent', (scope: SsrRangeHost) =>
            maybeThenAll([
              createSsrPending(
                scope,
                scope.nextId(),
                createQRL('', 'encoderContent', (scope: SsrRangeHost) => {
                  const value = registerSubscriberToOwner(
                    new SerializerSignal<number, unknown>(null, undefined, {
                      initial: 1,
                      deserialize: (value: unknown) => Number(value),
                      serialize() {
                        startEncoding();
                        return encoder;
                      },
                    })
                  );
                  value.value;
                  scope.addRoot(value);
                  return pending;
                }),
                createQRL('', 'placeholder', () => 'never-encoder-placeholder')
              ),
              createSsrPending(
                scope,
                scope.nextId(),
                createQRL('', 'failureContent', () => failing)
              ),
            ])
          ),
          createQRL('', 'fallback', () => '<p>cancelled-encoder-fallback</p>')
        ),
      { stream }
    );
    await written;
    resolveContent('<p>unpublished-encoder-output</p>');
    await encoding;
    rejectSibling(new Error('sibling failed'));
    await rendering;
    resolveEncoder({ private: 'PRIVATE_LATE_ENCODER' });
    await Promise.resolve();
    const html = chunks.join('');
    expect(html).toContain('cancelled-encoder-fallback');
    expect(html).not.toContain('unpublished-encoder-output');
    expect(html).not.toContain('PRIVATE_LATE_ENCODER');
  });

  test('finishes a committed frame under backpressure before publishing Catch fallback', async () => {
    let resolve!: (output: string) => void;
    let releaseWrite!: () => void;
    let frameStarted!: () => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const blocked = new Promise<void>((done) => {
      releaseWrite = done;
    });
    const started = new Promise<void>((done) => {
      frameStarted = done;
    });
    let boundary!: NonNullable<SsrRangeHost['catchBoundary']>;
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'catchBody', (scope: SsrRangeHost) => {
            boundary = scope.catchBoundary!;
            return createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'content', () => pending),
              createQRL('', 'placeholder', () => 'backpressure-placeholder')
            );
          }),
          createQRL('', 'fallback', () => 'backpressure-fallback')
        ),
      {
        stream: {
          write(chunk) {
            chunks.push(String(chunk));
            if (chunk.includes('<template') && chunk.includes('committed-content')) {
              frameStarted();
              return blocked;
            }
          },
        },
      }
    );
    resolve('committed-content');
    await started;
    await boundary.catchError(new Error('after write started'));
    expect(chunks.join('')).not.toContain('backpressure-fallback');
    expect(chunks.at(-1)).toContain('window._qwikS(');
    releaseWrite();
    await rendering;
    expect(chunks.join('')).toContain('backpressure-fallback');
  });

  test('rolls back an OOOS frame whose serializer throws inside Catch', async () => {
    let resolve!: (output: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const { chunks, written, stream } = captureStreamUntil('waiting-encoder');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'catchContent', (scope: SsrRangeHost) =>
            createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'serializeContent', (contentScope: SsrRangeHost) => {
                const value = registerSubscriberToOwner(
                  new SerializerSignal(null, undefined, {
                    initial: 1,
                    deserialize: (value: number) => value,
                    serialize() {
                      throw new Error('PRIVATE_ENCODER_FAILURE');
                    },
                  })
                );
                value.value;
                contentScope.addRoot(value);
                contentScope.addRoot({ private: 'PRIVATE_BEFORE_ENCODER' });
                return pending;
              }),
              createQRL('', 'placeholder', () => 'waiting-encoder')
            )
          ),
          createQRL('', 'encoderFallback', () => '<p>encoder-fallback</p>')
        ),
      { stream }
    );
    await written;
    resolve('<p>unpublished-content</p>');
    await rendering;
    const html = chunks.join('');
    expect(html).toContain('encoder-fallback');
    expect(html).not.toContain('unpublished-content');
    expect(html).not.toContain('PRIVATE_BEFORE_ENCODER');
  });

  test('catches a serializer failure after a shell root ID was published', async () => {
    const result = await renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'shellContent', (scope: SsrRangeHost) => {
          const value = registerSubscriberToOwner(
            new SerializerSignal(null, undefined, {
              initial: 1,
              deserialize: (value: number) => value,
              serialize() {
                throw new Error('PRIVATE_SHELL_ENCODER');
              },
            })
          );
          value.value;
          scope.addRoot(value);
          return '<p>shell-content</p>';
        }),
        createQRL('', 'shellFallback', () => '<p>shell-fallback</p>')
      )
    );
    expect(result.html).toContain('shell-fallback');
  });

  test('replaces a published Catch after a deferred rejection and completes its sibling', async () => {
    let reject!: (error: unknown) => void;
    let resolveSibling!: (output: string) => void;
    const failing = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    const sibling = new Promise<string>((done) => {
      resolveSibling = done;
    });
    const { chunks, written, stream } = captureStreamUntil('pending-fallback');
    const rendering = renderToStream(
      (_props, ctx) =>
        maybeThenAll([
          createSsrCatch(
            ctx,
            ctx.nextId(),
            createQRL('', 'catchBody', (scope: SsrRangeHost) =>
              createSsrPending(
                scope,
                scope.nextId(),
                createQRL('', 'failing', () => failing),
                createQRL('', 'placeholder', () => '<p>pending-fallback</p>')
              )
            ),
            createQRL('', 'catchFallback', () => '<p>catch-fallback</p>')
          ),
          createSsrPending(
            ctx,
            ctx.nextId(),
            createQRL('', 'sibling', () => sibling),
            createQRL('', 'siblingPlaceholder', () => '<p>sibling-pending</p>')
          ),
        ]),
      { stream }
    );
    await written;
    reject(new Error('late render failure'));
    resolveSibling('<p>sibling-ready</p>');
    const result = await rendering;
    expect(result.hasCaughtError).toBe(true);
    const html = chunks.join('');
    expect(html).toContain('catch-fallback');
    expect(html).toContain('sibling-ready');
    expect(html).toContain('q:s="0"');
    expect(html).toContain('q:dispose');
  });

  test('streams Pending inside Catch before its content settles', async () => {
    let resolve!: (output: string) => void;
    const content = new Promise<string>((done) => {
      resolve = done;
    });
    const { chunks, written, stream } = captureStreamUntil('pending-shell');
    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'catchContent', (scope: SsrRangeHost) =>
            createSsrPending(
              scope,
              scope.nextId(),
              createQRL('', 'slowContent', () => content),
              createQRL('', 'pendingFallback', () => '<p>pending-shell</p>')
            )
          ),
          createQRL('', 'catchFallback', () => '<p>caught</p>')
        ),
      { stream }
    );
    await written;
    const shell = chunks.join('');
    resolve('<p>resolved-content</p>');
    await rendering;
    expect(shell).toContain('pending-shell');
    expect(shell).not.toContain('resolved-content');
    expect(chunks.join('')).toContain('resolved-content');
  });

  test('does not serialize roots from a rejected Catch render', async () => {
    const result = await renderToString((_props, ctx) =>
      createSsrCatch(
        ctx,
        ctx.nextId(),
        createQRL('', 'failedContent', (scope: SsrRangeHost) => {
          scope.addRoot(useSignal(new Error('PRIVATE_THROWN_MESSAGE')));
          throw new Error('failed');
        }),
        createQRL('', 'safeFallback', () => '<p>safe</p>')
      )
    );
    expect(result.html).toContain('<p>safe</p>');
    expect(result.html).not.toContain('PRIVATE_THROWN_MESSAGE');
  });

  test('the public entry renders a JSX value or a component as the root, the v2 contract', async () => {
    // the compiler hands `renderToStream(<Root />)` a JSX value: a QRL over `(ctx) => output`
    const jsxRoot = inlinedQrl(
      (ctx: { nextId(): number }) => ['<p q:id="', createSsrNodeId(ctx.nextId()), '">jsx-root</p>'],
      'jsx_root'
    );
    const component = _markComponent(() => '<p>component-root</p>', 'sym', './x');

    expect((await publicRenderToString(jsxRoot as never)).html).toMatch(
      /<p q:id="[^"]+">jsx-root<\/p>/
    );
    expect((await publicRenderToString(component as never)).html).toContain(
      '<p>component-root</p>'
    );
  });

  test('streams the prefix before async children and keeps their document order', async () => {
    let resolveFirst!: (output: string) => void;
    let resolveSecond!: (output: string) => void;
    let prefixWritten!: () => void;
    const first = new Promise<string>((resolve) => (resolveFirst = resolve));
    const second = new Promise<string>((resolve) => (resolveSecond = resolve));
    const prefix = new Promise<void>((resolve) => (prefixWritten = resolve));
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) => [
        '<head></head><body><p>prefix</p>',
        ctx.observeError(
          first.then((html) => {
            ctx.styleIds.set('late-style', '.late { color: red; }');
            return html;
          })
        ),
        ctx.observeError(second),
        '<p>tail</p></body>',
      ],
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('<p>prefix</p>')) {
              prefixWritten();
            }
          },
        },
      }
    );

    await prefix;
    expect(chunks.join('')).toContain('<p>prefix</p>');
    expect(chunks.join('')).not.toContain('<p>tail</p>');
    resolveSecond('<p>second</p>');
    await Promise.resolve();
    expect(chunks.join('')).not.toContain('<p>second</p>');
    resolveFirst('<p class="late">first</p>');
    await rendering;
    const html = chunks.join('');
    expect(html).toContain('<style q:style="late-style">.late { color: red; }</style>');
    expect(html.indexOf('q:style="late-style"')).toBeLessThan(html.indexOf('<p class="late">'));
    expect(html).toContain('<p class="late">first</p><p>second</p><p>tail</p>');
  });

  test('attaches useOn to the prefix without awaiting its async children', async () => {
    let resolveChild!: (output: string) => void;
    const child = new Promise<string>((resolve) => (resolveChild = resolve));
    let prefixWritten!: () => void;
    const prefix = new Promise<void>((resolve) => (prefixWritten = resolve));
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) => {
        useOnDocument(
          'qinit',
          createQRL('listener.js', 'handler', () => {}, null, null)
        );
        return [createSsrOpenTag('<p', '>'), 'prefix</p>', ctx.observeError(child)];
      },
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('prefix</p>')) {
              prefixWritten();
            }
          },
        },
      }
    );
    await prefix;
    expect(chunks.join('')).toContain('q-d:qinit="listener.js#handler"');
    resolveChild('<p>async</p>');
    await rendering;
    expect(chunks.join('')).toContain('<p>async</p>');
  });

  test('propagates an eager child rejection after writing the preceding child', async () => {
    let resolveFirst!: (output: string) => void;
    let rejectSecond!: (error: Error) => void;
    const first = new Promise<string>((resolve) => (resolveFirst = resolve));
    const second = new Promise<string>((_resolve, reject) => (rejectSecond = reject));
    const error = new Error('async child failed');
    const rendering = renderToStream(
      (_props, ctx) => [ctx.observeError(first), ctx.observeError(second)],
      {
        containerTagName: 'div',
        stream: { write() {} },
      }
    );
    const rejected = expect(rendering).rejects.toBe(error);
    rejectSecond(error);
    await Promise.resolve();
    resolveFirst('first');
    await rejected;
  });

  test('defines a placed sync handler right before its element, once', async () => {
    const handler = _qrlSync((event: Event) => event.preventDefault(), 'placed_key', 'e=>e.p()');
    const button = (ctx: SsrRenderContext) => [
      ctx.syncFn(handler as never),
      '<button',
      ctx.eventAttrParts('q-e:click', handler),
      '>go</button>',
    ];
    const result = await renderToString((_props, ctx) => [
      '<p>far away</p>',
      button(ctx),
      button(ctx),
    ]);

    expect(result.html).toContain('<p>far away</p><script q:func="qwik/json">((d)=>{(d["qFuncs_');
    expect(result.html).toMatch(/\["placed_key"\]=e=>e\.p\(\)\}\)\(document\)<\/script><button/);
    expect(result.html.match(/<script q:func="qwik\/json"/g)).toHaveLength(1);
  });

  test('defines a late sync handler before streaming its element', async () => {
    let release!: () => void;
    let prefixWritten!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const prefix = new Promise<void>((resolve) => (prefixWritten = resolve));
    const chunks: string[] = [];
    const rendering = renderToStream(
      (_props, ctx) => [
        '<head></head><body>prefix',
        ctx.observeError(
          pending.then(() =>
            createSsrOpenTag(
              '<button',
              ctx.eventAttr(
                'q-e:click',
                _qrlSync((event: Event) => event.preventDefault(), 'late_key')
              ),
              '>'
            )
          )
        ),
        'async</button></body>',
      ],
      {
        stream: {
          write(chunk) {
            chunks.push(chunk);
            if (chunk.includes('prefix')) {
              prefixWritten();
            }
          },
        },
      }
    );
    await prefix;
    release();
    await rendering;
    const html = chunks.join('');
    const definition = html.indexOf('<script q:func="qwik/json"');
    expect(definition).toBeGreaterThan(html.indexOf('prefix'));
    expect(definition).toBeLessThan(html.indexOf('<button'));
    expect(html).toContain('q-e:click="#late_key"');
  });

  test('recognizes authored document sections behind a pending child', async () => {
    const result = await renderToString((_props, ctx) => [
      createSsrMarkup('<!b=', createSsrNodeId(ctx.nextId()), '>'),
      ctx.observeError(
        Promise.resolve([
          createSsrSection('head', '<head', '>'),
          '<title>async head</title>',
          createSsrSection('/head', '</head>'),
        ])
      ),
      ctx.observeError(
        Promise.resolve([
          createSsrSection('body', '<body', '>'),
          '<p>content</p>',
          createSsrSection('/body', '</body>'),
        ])
      ),
    ]);
    expect(result.html.match(/<head>/g)).toHaveLength(1);
    expect(result.html.match(/<body>/g)).toHaveLength(1);
    expect(result.html).toContain('<head><title>async head</title></head><body><p>content</p>');
  });

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
      firstRef = ctx.optionalContextScopeRef()!;
      secondRef = ctx.optionalContextScopeRef()!;
      return [createSsrMarkup('<!c=', firstRef, '>'), '<p>value</p>', '<!/c>'];
    });

    expect(firstRef).toEqual({ type: 'root-value', value: scope });
    expect(secondRef).toEqual(firstRef);
    expect(scope.id).toBeNull();
    expect(result.html).toContain('<!c=0><p>value</p><!/c>');
  });

  test('only references a context scope when a provider ran', async () => {
    const context = { id: 'conditional-context' } as ContextId<string>;

    for (let i = 0; i < 2; i++) {
      const shouldProvide = i === 1;
      const result = await renderToString((_props, ctx) => {
        if (shouldProvide) {
          useContextProvider(context, 'value');
        }
        const scope = ctx.optionalContextScopeRef();
        return scope === null
          ? '<p>empty</p>'
          : [createSsrMarkup('<!c=', scope, '>'), '<p>value</p>', '<!/c>'];
      });

      expect(result.html.includes('<!c=')).toBe(shouldProvide);
    }
  });

  test('materializes event captures and nested structured output without coercion', async () => {
    const captured = { value: 'captured' };
    const handler = createQRL('./listener.js', '_handler', () => {}, null, [captured]);

    const result = await renderToString((_props, ctx) => [
      createSsrOpenTag('<button', ctx.eventAttr('q-e:click', handler), '>'),
      ['before', [createSsrMarkup('<!r=', createSsrNodeId(ctx.nextId()), '>'), 'row', '<!/r>']],
      '</button>',
    ]);

    expect(result.html).toContain(
      '<button q-e:click="listener.js#_handler#0">before<!r=0>row<!/r></button>'
    );
    expect(result.html).not.toContain('[object Object]');
    expect(result.html).not.toContain(',before');
  });

  test('renders flat output: naked references and eventAttrParts, no records', async () => {
    const captured = { value: 'captured' };
    const handler = createQRL('./listener.js', '_handler', () => {}, null, [captured]);

    const result = await renderToString((_props, ctx) => [
      '<button q:id="',
      createSsrNodeId(ctx.nextId()),
      '"',
      ctx.eventAttrParts('q-e:click', handler),
      ctx.eventAttrParts('q-e:input', null),
      '>go</button>',
    ]);

    expect(result.html).toContain(
      '<button q:id="0" q-e:click="listener.js#_handler#0">go</button>'
    );
  });

  test('serializes an inlined bind handler capture once', async () => {
    const result = await renderToString((_props, ctx) => {
      const value = useSignal('server');
      ctx.addRoot(value);
      return createSsrOpenTag(
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
        createSsrOpenTag('<span data-node="', createSsrNodeId(ctx.nextId()), '">'),
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
        createSsrSection('head', '<head data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<title>x</title>',
        createSsrSection('/head', '</head>'),
        createSsrSection('body', '<body data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<p>x</p>',
        createSsrSection('/body', '</body>'),
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
        createSsrOpenTag('<body data-node="', createSsrNodeId(ctx.nextId()), '">'),
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

  test('moves a carrier into a head following a projected slot marker', async () => {
    const handler = createQRL('./listener.js', '_handler', () => {}, null, []);
    const result = await renderToString(
      (_props, ctx) => {
        const carrier: SsrOutput = [
          {
            ...createSsrOpenTag('<script hidden', ctx.eventAttr('q-d:qinit', handler), '>'),
            headlessCarrier: true,
          },
          '</script>',
        ];
        return [
          '<!s=',
          createSsrNodeId(ctx.nextId()),
          '>',
          createSsrSection('head', '<head', '>'),
          '<meta charset="utf-8">',
          createSsrSection('/head', '</head>'),
          createSsrSection('body', '<body', '>'),
          '<p>value</p>',
          createSsrSection('/body', '</body>'),
          '<!/s>',
          carrier,
        ];
      },
      { containerTagName: 'html' }
    );

    expect(result.html.match(/<head>/g)).toHaveLength(1);
    expect(result.html.match(/<body>/g)).toHaveLength(1);
    expect(result.html).toContain(
      '<head><script hidden q-d:qinit="listener.js#_handler"></script><meta charset="utf-8"></head>'
    );
  });

  test('leaves head text inside a body comment alone', async () => {
    const handler = createQRL('./listener.js', '_handler', () => {}, null, []);
    const result = await renderToString(
      () => {
        useOnDocument('qinit', handler);
        return [
          createSsrSection('body', '<body', '>'),
          '<!-- <head> --><p>value</p>',
          createSsrSection('/body', '</body>'),
        ];
      },
      { containerTagName: 'html' }
    );

    // the anchored body is an element carrier, so the event needs no relocated script
    expect(result.html).toContain('<head></head>');
    expect(result.html).toContain(
      '<body q-d:qinit="listener.js#_handler"><!-- <head> --><p>value</p>'
    );
  });

  test('defines a cross-module sync handler inside the authored head', async () => {
    const handler = _qrlSync((event: Event) => event.preventDefault(), 'sync_key');
    const result = await renderToString(
      () => {
        useOnDocument('qinit', handler);
        return [
          createSsrSection('head', '<head', '>'),
          '<meta charset="utf-8">',
          createSsrSection('/head', '</head>'),
          createSsrSection('body', '<body', '>'),
          '<p>value</p>',
          createSsrSection('/body', '</body>'),
        ];
      },
      { containerTagName: 'html' }
    );

    const head = result.html.indexOf('<head');
    const definition = result.html.indexOf('<script q:func="qwik/json"');
    expect(definition).toBeGreaterThan(result.html.indexOf('>', head));
    expect(definition).toBeLessThan(result.html.indexOf('</head>'));
    expect(result.html.match(/<head(?:\s|>)/g)).toHaveLength(1);
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
        const description = renderSsrAttr(nodeId, 'aria-describedby', descriptionId);
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
        return createSsrOpenTag(
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
          nodeId,
          'title',
          [],
          createQRL('', 'title', () => pending, null, null)
        );
        return createSsrOpenTag(
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
          firstId,
          'title',
          [],
          createQRL('', 'firstTitle', () => first, null, null)
        ) as string | null;
        const secondTitle = renderSsrAttrExpression(
          secondId,
          'title',
          [],
          createQRL('', 'secondTitle', () => second, null, null)
        ) as string | null;
        return [
          createSsrOpenTag(
            '<input q:id="',
            createSsrNodeId(firstId),
            '"',
            firstTitle === null ? '' : ` title="${firstTitle}"`,
            '>'
          ),
          createSsrOpenTag(
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

  test('renders runtime-shaped children: closure, promise, text, empty', async () => {
    const view = () => '<p>hi</p>';
    const result = await renderToString((_props, _ctx) =>
      maybeThenAll([
        renderSsrDynamicContent(view),
        renderSsrDynamicContent(Promise.resolve(view)),
        renderSsrDynamicContent('a <b> c'),
        renderSsrDynamicContent(null),
        renderSsrDynamicContent(false),
      ])
    );

    expect(result.html).toContain('<p>hi</p><p>hi</p>a &lt;b&gt; c');
  });

  test.each([false, true])('reports whether a buffered Catch caught: %s', async (failed) => {
    const chunks: string[] = [];
    const result = await renderToStream(
      (_props, ctx) =>
        createSsrCatch(
          ctx,
          ctx.nextId(),
          createQRL('', 'content', () => {
            if (failed) {
              throw new Error('render failed');
            }
            return '<p>ready</p>';
          }),
          createQRL('', 'fallback', (_ctx, error) => (error as Error).message)
        ),
      {
        stream: {
          write: (chunk) => {
            chunks.push(String(chunk));
          },
        },
      }
    );
    expect(result.hasCaughtError).toBe(failed);
    expect(chunks.join('')).toContain(failed ? 'render failed' : '<p>ready</p>');
    expect(chunks.join('')).not.toContain('qErr(');
  });

  test('keeps synchronous Pending content inline', async () => {
    const fallback = vi.fn(() => '<p>fallback</p>');

    const result = await renderToString((_props, ctx) =>
      createSsrPending(
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

  test('streams no fallback for a collapsed reveal boundary that cannot reveal yet', async () => {
    let resolveFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => (resolveFirst = resolve));
    let resolveSecond!: (value: string) => void;
    const second = new Promise<string>((resolve) => (resolveSecond = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      ((_props: undefined, ctx: Parameters<SsrRenderRoot>[1]) => {
        const group = createRevealGroup('sequential', true, 2);
        return [
          createSsrPending(
            ctx,
            ctx.nextId(),
            createQRL('', 'content1', () => first, null, null),
            createQRL('', 'fallback1', () => '<p>fallback-1</p>', null, null),
            0,
            group,
            0
          ),
          createSsrPending(
            ctx,
            ctx.nextId(),
            createQRL('', 'content2', () => second, null, null),
            createQRL('', 'fallback2', () => '<p>fallback-2</p>', null, null),
            0,
            group,
            1
          ),
        ];
      }) as unknown as SsrRenderRoot,
      {
        containerTagName: 'div',
        stream: {
          write(chunk) {
            chunks.push(chunk);
          },
        },
      }
    );

    // let the shell flush, then resolve out of order: second first
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chunks.join('')).toContain('<p>fallback-1</p>');
    expect(chunks.join('')).not.toContain('fallback-2');

    resolveSecond('<p>content-2</p>');
    await new Promise((resolve) => setTimeout(resolve, 5));
    // the resolved packet is held server-side until the first boundary reveals
    expect(chunks.join('')).not.toContain('content-2');

    resolveFirst('<p>content-1</p>');
    await rendering;
    const html = chunks.join('');
    expect(html).toContain('<p>content-1</p>');
    expect(html).toContain('<p>content-2</p>');
    // packets flush in reveal order: first before second
    expect(html.indexOf('content-1')).toBeLessThan(html.indexOf('content-2'));
  });

  test('writes a fallback shell before its resolved packet', async () => {
    let resolveContent!: (value: string) => void;
    const content = new Promise<string>((resolve) => (resolveContent = resolve));
    let shellWritten!: () => void;
    const shell = new Promise<void>((resolve) => (shellWritten = resolve));
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrPending(
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

  test('writes fallback while Pending content waits on a task', async () => {
    let markTaskStarted!: () => void;
    const taskStarted = new Promise<void>((resolve) => (markTaskStarted = resolve));
    let resolveTask!: () => void;
    const chunks: string[] = [];

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrPending(
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

  test('fails pending Pending content when its task rejects', async () => {
    let rejectTask!: (error: Error) => void;
    let markTaskStarted!: () => void;
    const taskStarted = new Promise<void>((resolve) => (markTaskStarted = resolve));
    const content = new Promise<string>(() => {});
    const error = new Error('task failed');

    const rendering = renderToStream(
      (_props, ctx) =>
        createSsrPending(
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
        createSsrPending(
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
                const value = renderSsrAttr(targetId, 'title', title);
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
                return createSsrOpenTag(
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
        createSsrPending(
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
                  targetId,
                  'title',
                  [],
                  createQRL('', 'title', () => title, null, null)
                );
                return createSsrOpenTag(
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
          targetId,
          'title',
          [],
          createQRL('', 'title', () => title, null, null)
        );
        return [
          createSsrOpenTag(
            '<input q:id="',
            createSsrNodeId(targetId),
            value === null ? '">' : `" title="${value}">`
          ),
          createSsrPending(
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
          targetId,
          'title',
          [],
          createQRL('', 'title', () => title, null, null)
        );
        return [
          createSsrOpenTag('<input q:id="', createSsrNodeId(targetId), '">'),
          createSsrPending(
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
        createSsrPending(
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
        return createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'content',
            () =>
              _await(content).then((resume) => {
                resume();
                return `<p>${renderSsrTextNode(0, null, count)}</p>`;
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
        createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL('', 'first', () => first, null, null),
          createQRL('', 'firstFallback', () => 'first fallback', null, null)
        ) as SsrOutput,
        createSsrPending(
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
        createSsrPending(
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
      createSsrPending(
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
        createSsrPending(
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
        createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL(
            '',
            'outer',
            (contentCtx) => {
              const child = createSsrPending(
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
        createSsrPending(
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
        createSsrPending(
          ctx,
          ctx.nextId(),
          createQRL('', 'outer', () => outer, null, null),
          createQRL(
            '',
            'outerFallback',
            (fallbackCtx) => [
              'outer fallback',
              createSsrPending(
                fallbackCtx,
                fallbackCtx.nextId(),
                createQRL(
                  '',
                  'inner',
                  (innerCtx) => {
                    const targetId = innerCtx.nextId();
                    const value = renderSsrAttrExpression(
                      targetId,
                      'title',
                      [],
                      createQRL('', 'title', () => title, null, null)
                    );
                    return inner.then(() =>
                      createSsrOpenTag(
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

describe('deterministic rendering', () => {
  test('uses a provided instanceHash so output is byte-reproducible', async () => {
    const root: SsrRenderRoot = () => '<p>static</p>';

    const first = await renderToString(root, { instanceHash: 'test01' });
    const second = await renderToString(root, { instanceHash: 'test01' });

    expect(first.html).toContain('q:instance="test01"');
    expect(first.html).toBe(second.html);
  });

  test('generates a random instanceHash when not provided', async () => {
    const root: SsrRenderRoot = () => '<p>static</p>';

    const first = await renderToString(root);
    const second = await renderToString(root);

    expect(first.html).toMatch(/q:instance="[a-z0-9]{6}"/);
    expect(first.html).not.toBe(second.html);
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
      const description = renderSsrAttr(nodeId, 'aria-describedby', descriptionId);
      useTask(() => {
        descriptionId.value = pending;
      });
      return createSsrOpenTag(
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

describe('preloader', () => {
  const manifest = {
    manifestHash: 'test',
    mapping: { _handler: 'q-handler.js' },
    symbols: {},
    bundles: {},
    preloader: 'q-preloader.js',
    core: 'q-core.js',
    bundleGraphAsset: 'assets/bundle-graph.json',
  };
  const renderPage = (preloader?: false) =>
    renderToString(
      (_props, ctx) => [
        createSsrSection('head', '<head', '>'),
        '<title>page</title>',
        createSsrSection('/head', '</head>'),
        createSsrSection('body', '<body', '>'),
        createSsrOpenTag(
          '<button',
          ctx.eventAttr(
            'q-e:click',
            createQRL('./listener.js', '_handler', () => {}, null, null)
          ),
          '>'
        ),
        'go</button>',
        createSsrSection('/body', '</body>'),
      ],
      { manifest: manifest as never, ...(preloader === false ? { preloader } : {}) }
    );

  test('starts the preloader in the head and preloads the page bundles at the end', async () => {
    const { html } = await renderPage();
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

    expect(head).toContain('<link rel="modulepreload" href="/build/q-preloader.js">');
    expect(head).toContain(
      '<link rel="preload" href="/assets/bundle-graph.json" as="fetch" crossorigin="anonymous">'
    );
    expect(head).toContain('import("/build/q-preloader.js").then(({l})=>l("/build/",b))');
    expect(head).toContain('<link rel="modulepreload" href="/build/q-core.js">');
    const tail = html.slice(html.indexOf('</head>'));
    expect(tail).toMatch(/<script[^>]*q:type="preload"[^>]*>.*"q-handler\.js".*<\/script>/);
  });

  test('emits no preloader assets when it is disabled', async () => {
    const { html } = await renderPage(false);

    expect(html).not.toContain('q-preloader.js');
    expect(html).not.toContain('q-core.js');
    expect(html).not.toContain('bundle-graph.json');
    expect(html).not.toContain('q:type="preload"');
  });
});

describe('qwikloader', () => {
  const renderPage = (qwikLoader?: 'inline') =>
    renderToString(
      (_props, ctx) => [
        createSsrSection('head', '<head', '>'),
        '<title>page</title>',
        createSsrSection('/head', '</head>'),
        createSsrSection('body', '<body', '>'),
        createSsrOpenTag(
          '<button',
          ctx.eventAttr(
            'q-e:click',
            createQRL('./listener.js', '_handler', () => {}, null, null)
          ),
          '>'
        ),
        'go</button>',
        createSsrSection('/body', '</body>'),
      ],
      {
        manifest: {
          manifestHash: 'test',
          mapping: { _handler: 'q-handler.js' },
          qwikLoader: 'q-loader.js',
        } as never,
        ...(qwikLoader ? { qwikLoader } : {}),
      }
    );

  test('loads the manifest qwikloader as a module script at the top of the head', async () => {
    const { html } = await renderPage();
    const head = html.slice(html.indexOf('<head>') + '<head>'.length, html.indexOf('</head>'));

    expect(head).toMatch(
      /^<link rel="modulepreload" href="\/build\/q-loader\.js"><script async type="module" src="\/build\/q-loader\.js"><\/script>/
    );
    expect(html).not.toContain('id="qwikloader"');
    expect(html).toContain('window._qwikEv');
  });

  test('inlines the qwikloader at the end when asked to', async () => {
    const { html } = await renderPage('inline');

    expect(html).not.toContain('src="/build/q-loader.js"');
    expect(html.indexOf('id="qwikloader"')).toBeGreaterThan(html.indexOf('</head>'));
  });
});

describe('document tail', () => {
  test('writes the state and loader scripts inside the authored body', async () => {
    const { html } = await renderToString((_props, ctx) => [
      createSsrSection('head', '<head', '>'),
      '<title>page</title>',
      createSsrSection('/head', '</head>'),
      createSsrSection('body', '<body', '>'),
      createSsrOpenTag(
        '<button',
        ctx.eventAttr(
          'q-e:click',
          createQRL('./listener.js', '_handler', () => {}, null, null)
        ),
        '>'
      ),
      'go</button>',
      createSsrSection('/body', '</body>'),
    ]);
    const bodyEnd = html.lastIndexOf('</body>');

    expect(html.indexOf('window._qwikEv')).toBeGreaterThan(-1);
    expect(html.indexOf('window._qwikEv')).toBeLessThan(bodyEnd);
    expect(html.slice(bodyEnd)).toBe('</body></html>');
  });

  test('gives a document without authored sections its own head and body', async () => {
    const { html } = await renderToString(() => '<p>bare</p>', { containerTagName: 'html' });

    expect(html).toMatch(/<html[^>]*><head><\/head><body><p>bare<\/p>/);
    expect(html.endsWith('</body></html>')).toBe(true);
  });
});
