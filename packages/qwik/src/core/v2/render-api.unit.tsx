import { describe, it, expect, expectTypeOf, beforeEach, vi, afterEach } from 'vitest';
import { render2 } from './client/dom-render';
import { render } from '../render/dom/render.public';
import { renderToStream, renderToString } from '@builder.io/qwik/server';
import { renderToStream2, renderToString2 } from './ssr/ssr-render2';
import { component$, componentQrl } from '../component/component.public';
import { useSignal } from '../use/use-signal';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { inlinedQrl } from '../qrl/qrl';
import { createDocument } from '@builder.io/qwik-dom';
import { getDomContainer } from './client/dom-container';
import { vnode_getFirstChild } from './client/vnode';
import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import './vdom-diff.unit-util';
import { trigger } from '../../testing/element-fixture';
import { useServerData } from '../use/use-env-data';
import { useTask$ } from '../use/use-task';
import { getPlatform, setPlatform } from '../platform/platform';
import { getTestPlatform } from '../../testing/platform';
import { Resource, useResourceQrl } from '../use/use-resource';
import { _fnSignal } from '../internal';
import type { QwikManifest } from '@builder.io/qwik/optimizer';
import { useOn } from '../use/use-on';

vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

const defaultManifest: QwikManifest = {
  manifestHash: 'manifest-hash',
  symbols: {},
  bundles: {},
  mapping: {},
  version: '1',
};

const defaultCounterManifest: QwikManifest = {
  ...defaultManifest,
  mapping: {
    click: 'click.js',
  },
};

describe('render api', () => {
  let document: Document;
  beforeEach(() => {
    document = createDocument();
  });

  // const Greeter = componentQrl<{ salutation?: string; name?: string }>(
  //   inlinedQrl(({ salutation, name }) => {
  //     return (
  //       <span>
  //         {salutation || 'Hello'} {name || 'World'}!
  //       </span>
  //     );
  //   }, 's_greeter')
  // );

  const Counter = componentQrl(
    inlinedQrl(() => {
      const count = useSignal(123);
      return (
        <button
          onClick$={inlinedQrl(
            () => {
              useLexicalScope()[0].value++;
            },
            's_click',
            [count]
          )}
        >
          {count.value}
        </button>
      );
    }, 's_counter')
  );

  describe('types', () => {
    it('should have same type signature()', () => {
      expectTypeOf(render2).toEqualTypeOf(render);
      expectTypeOf(renderToString2).toEqualTypeOf(renderToString);
      expectTypeOf(renderToStream2).toEqualTypeOf(renderToStream);
    });
  });
  describe('render()', () => {
    it('should render counter', async () => {
      await render2(document.body, <Counter />);
      await getTestPlatform().flush();
      const container = getDomContainer(document.body);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>123</button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>124</button>
        </Component>
      );
    });
    it('should pass serverData', async () => {
      const TestCmp = component$(() => {
        const myKey = useServerData<string>('my-key');
        const defaultKey = useServerData<string>('other-key', 'default-value');
        return (
          <span>
            {myKey}/{defaultKey}
          </span>
        );
      });
      await render2(document.body, <TestCmp />, { serverData: { 'my-key': 'my-value' } });
      await getTestPlatform().flush();
      const container = getDomContainer(document.body);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <span>
            {'my-value'}/{'default-value'}
          </span>
        </Component>
      );
    });
    it('should cleanup', async () => {
      const log: string[] = [];
      const TestCmp = component$(() => {
        useTask$(() => {
          log.push('task');
          return () => {
            log.push('cleanup');
          };
        });
        return <span />;
      });
      const { cleanup } = await render2(document.body, <TestCmp />, {
        serverData: { 'my-key': 'my-value' },
      });
      await getTestPlatform().flush();
      expect(log).toEqual(['task']);
      cleanup();
      expect(log).toEqual(['task', 'cleanup']);
    });
  });
  describe('renderToString()', () => {
    it('should renderToString', async () => {
      const TestCmp = component$(() => {
        const count = useSignal(123);
        return (
          <button
            onClick$={inlinedQrl(
              () => {
                useLexicalScope()[0].value++;
              },
              's_click',
              [count]
            )}
          >
            {count.value}
          </button>
        );
      });
      const platform = getPlatform();
      try {
        const result = await renderToString2(<TestCmp />, {
          containerTagName: 'div',
        });
        document = createDocument(result.html);
      } finally {
        setPlatform(platform);
      }
      const container = getDomContainer(document.body.firstChild as HTMLElement);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>123</button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>124</button>
        </Component>
      );
    });
    describe('render result', () => {
      it('should render', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          manifest: defaultManifest,
        });
        expect(result).toMatchObject({
          isStatic: true,
          prefetchResources: expect.any(Array),
          timing: expect.any(Object),
          manifest: expect.any(Object),
          snapshotResult: expect.any(Object),
          html: expect.any(String),
        });
      });

      it('should have timings greater than 0', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
        });
        const timing = result.timing;
        expect(timing).toMatchObject({
          firstFlush: expect.any(Number),
          render: expect.any(Number),
          snapshot: expect.any(Number),
        });
        expect(timing.render).toBeGreaterThan(0);
        expect(timing.snapshot).toBeGreaterThan(0);
      });
    });
    describe('version', () => {
      afterEach(async () => {
        // restore default value
        const version = await import('./../version');
        vi.spyOn(version, 'version', 'get').mockReturnValue('dev');
      });

      it('should render', async () => {
        const testVersion = 'qwik-v-test123';
        const version = await import('./../version');
        vi.spyOn(version, 'version', 'get').mockReturnValue(testVersion);
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
        });
        expect(result.html).toContain(`q:version="${testVersion}"`);
        vi.clearAllMocks();
      });
    });
    describe('base', () => {
      it('should render', async () => {
        const testBase = '/abcd/123-test/';
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          base: testBase,
        });
        expect(result.html).toContain(`q:base="${testBase}"`);
      });
    });
    describe('locale', () => {
      it('should render', async () => {
        const testLocale = 'pl';
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          locale: testLocale,
        });
        expect(result.html).toContain(`q:locale="${testLocale}"`);
      });
      it('should render for function', async () => {
        const testLocale = 'pl';
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          locale: () => testLocale,
        });
        expect(result.html).toContain(`q:locale="${testLocale}"`);
      });
      it('should render from serverData', async () => {
        const testLocale = 'pl';
        const testServerDataLocale = 'en';
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          locale: testLocale,
          serverData: {
            locale: testServerDataLocale,
          },
        });
        expect(result.html).toContain(`q:locale="${testServerDataLocale}"`);
      });
    });
    describe('qwikLoader', () => {
      it('should render at bottom by default', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
        });
        const document = createDocument(result.html);
        // qwik loader is one before last
        const qwikLoaderScriptElement = document.body.firstChild?.lastChild
          ?.previousSibling as HTMLElement;
        expect(qwikLoaderScriptElement?.tagName.toLowerCase()).toEqual('script');
        expect(qwikLoaderScriptElement?.getAttribute('id')).toEqual('qwikloader');
      });
      it('should render at bottom', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          qwikLoader: {
            position: 'bottom',
          },
        });
        const document = createDocument(result.html);
        // qwik loader is one before last
        const qwikLoaderScriptElement = document.body.firstChild?.lastChild
          ?.previousSibling as HTMLElement;
        expect(qwikLoaderScriptElement?.tagName.toLowerCase()).toEqual('script');
        expect(qwikLoaderScriptElement?.getAttribute('id')).toEqual('qwikloader');
      });
      it('should render at top', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          qwikLoader: {
            position: 'top',
          },
        });
        const document = createDocument(result.html);
        // find last component element - button
        const button = document.querySelector('button') as HTMLButtonElement;
        const qwikLoaderScriptElement = button.nextSibling as HTMLElement;
        expect(qwikLoaderScriptElement?.tagName.toLowerCase()).toEqual('script');
        expect(qwikLoaderScriptElement?.getAttribute('id')).toEqual('qwikloader');
      });
      it('should always render', async () => {
        const result = await renderToString2(<div>static</div>, {
          containerTagName: 'div',
          qwikLoader: {
            include: 'always',
          },
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(1);
      });
      it('should not render for static content and auto include', async () => {
        const result = await renderToString2(<div>static</div>, {
          containerTagName: 'div',
          qwikLoader: {
            include: 'auto',
          },
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(0);
      });
      it('should never render', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          qwikLoader: {
            include: 'never',
          },
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(0);
      });
    });
    describe('qwikEvents', () => {
      it('should render', async () => {
        const ManyEventsComponent = componentQrl(
          inlinedQrl(() => {
            useOn(
              'focus',
              inlinedQrl(() => {}, 's_useOnFocus')
            );
            return (
              <div>
                <button
                  onClick$={inlinedQrl(() => {}, 's_click1')}
                  onDblClick$={inlinedQrl(() => {}, 's_dblclick1')}
                >
                  click
                </button>
                <button
                  onClick$={inlinedQrl(() => {}, 's_click2')}
                  onBlur$={inlinedQrl(() => {}, 's_blur1')}
                >
                  click
                </button>
              </div>
            );
          }, 's_manyEventsCmp')
        );

        const result = await renderToString2(<ManyEventsComponent />, {
          containerTagName: 'div',
        });
        const document = createDocument(result.html);
        // event script is next sibling of the qwik loader
        const eventScript = document.querySelector('script[id=qwikloader]')
          ?.nextSibling as HTMLElement;
        expect(eventScript.textContent).toContain(
          'window.qwikevents.push("focus", "click", "dblclick", "blur")'
        );
      });
    });
    describe('qwikFuncs', () => {
      it('should render', async () => {
        const CounterDerived = component$((props: { initial: number }) => {
          const count = useSignal(props.initial);
          return (
            <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
              Count: {_fnSignal((p0) => p0.value, [count], 'p0.value')}!
            </button>
          );
        });
        const result = await renderToString2(<CounterDerived initial={123} />, {
          containerTagName: 'div',
        });
        const document = createDocument(result.html);
        const qwikFuncScriptElements = document.querySelectorAll('script[q\\:func=qwik/json]');
        expect(qwikFuncScriptElements).toHaveLength(1);
        expect(qwikFuncScriptElements[0].textContent).toEqual(
          'document.currentScript.closest("[q\\\\:container]").qFuncs=[(p0)=>p0.value]'
        );
      });
    });
    describe('qwikPrefetchServiceWorker', () => {
      it.todo('should render', async () => {
        // TODO: not used?
      });
    });
    describe('prefetchStrategy', () => {
      it('should render with default prefetch implementation', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
          },
          manifest: defaultCounterManifest,
        });
        expect(result.prefetchResources).toEqual(expect.any(Array));
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        expect(document.querySelectorAll('script[q\\:type=link-js]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
      it('should render with linkInsert: "html-append"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              linkInsert: 'html-append',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        expect(document.querySelectorAll('script[q\\:type=link-js]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link[rel=prefetch][as=script]')).toHaveLength(1);
      });
      it('should render with linkInsert: "js-append"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              linkInsert: 'js-append',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        const linkJsScript = document.querySelectorAll('script[q\\:type=link-js]');
        expect(linkJsScript).toHaveLength(1);
        expect(linkJsScript[0]?.textContent).toContain('setAttribute("rel","prefetch")');
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
      it('should render with linkInsert: "html-append" and linkRel: "modulepreload"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              linkInsert: 'html-append',
              linkRel: 'modulepreload',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        expect(document.querySelectorAll('script[q\\:type=link-js]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link[rel=modulepreload]')).toHaveLength(1);
      });
      it('should render with linkInsert: "js-append" and linkRel: "modulepreload"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              linkInsert: 'js-append',
              linkRel: 'modulepreload',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        const linkJsScript = document.querySelectorAll('script[q\\:type=link-js]');
        expect(linkJsScript).toHaveLength(1);
        expect(linkJsScript[0]?.textContent).toContain('setAttribute("rel","modulepreload")');
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
      it('should render with linkInsert: "html-append" and linkRel: "preload"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              linkInsert: 'html-append',
              linkRel: 'preload',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        expect(document.querySelectorAll('script[q\\:type=link-js]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link[rel=preload]')).toHaveLength(1);
      });
      it('should render with linkInsert: "js-append" and linkRel: "preload"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              linkInsert: 'js-append',
              linkRel: 'preload',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        const linkJsScript = document.querySelectorAll('script[q\\:type=link-js]');
        expect(linkJsScript).toHaveLength(1);
        expect(linkJsScript[0]?.textContent).toContain('setAttribute("rel","preload")');
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
      it('should render with prefetchEvent: "null"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              prefetchEvent: null,
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=link-js]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(0);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
      it('should render with workerFetchInsert: "always"', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          prefetchStrategy: {
            symbolsToPrefetch: 'auto',
            implementation: {
              workerFetchInsert: 'always',
            },
          },
          manifest: defaultCounterManifest,
        });
        const document = createDocument(result.html);
        expect(document.querySelectorAll('script[q\\:type=prefetch-bundles]')).toHaveLength(1);
        expect(document.querySelectorAll('script[q\\:type=link-js]')).toHaveLength(0);
        expect(document.querySelectorAll('script[q\\:type=prefetch-worker]')).toHaveLength(1);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
    });
    describe('containerTagName/containerAttributes', () => {
      it('should render correct container tag name', async () => {
        const testTag = 'test-tag';
        const result = await renderToString2(<Counter />, {
          containerTagName: testTag,
        });
        const document = createDocument(result.html);
        expect(document.body.firstChild?.nodeName.toLowerCase()).toEqual(testTag);
      });
      it('should render custom container attributes', async () => {
        const testAttrName = 'test-attr';
        const testAttrValue = 'test-value';
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          containerAttributes: {
            [testAttrName]: testAttrValue,
          },
        });
        expect(result.html.includes(`${testAttrName}="${testAttrValue}"`)).toBeTruthy();
      });
      describe('qRender', () => {
        afterEach(async () => {
          // restore default value
          const qDev = await import('./../util/qdev');
          vi.spyOn(qDev, 'qDev', 'get').mockReturnValue(true);
        });
        it('should render qRender with "ssr-dev" value in dev mode', async () => {
          const result = await renderToString2(<Counter />, {
            containerTagName: 'div',
          });
          expect(result.html.includes('q:render="ssr-dev"')).toBeTruthy();
        });
        it('should render qRender with "ssr" value in prod mode', async () => {
          const qDev = await import('./../util/qdev');
          vi.spyOn(qDev, 'qDev', 'get').mockReturnValue(false);

          const result = await renderToString2(<Counter />, {
            containerTagName: 'div',
          });
          expect(result.html.includes('q:render="ssr"')).toBeTruthy();
        });
        it('should render qRender with custom value in dev mode', async () => {
          const testRender = 'ssr-test';
          const result = await renderToString2(<Counter />, {
            containerTagName: 'div',
            containerAttributes: {
              'q:render': testRender,
            },
          });
          expect(result.html.includes(`q:render="${testRender}-ssr-dev"`)).toBeTruthy();
        });
        it('should render qRender with custom value in prod mode', async () => {
          const qDev = await import('./../util/qdev');
          vi.spyOn(qDev, 'qDev', 'get').mockReturnValue(false);

          const testRender = 'ssr-test';
          const result = await renderToString2(<Counter />, {
            containerTagName: 'div',
            containerAttributes: {
              'q:render': testRender,
            },
          });
          expect(result.html.includes(`q:render="${testRender}-ssr"`)).toBeTruthy();
        });
      });
    });
    describe('serverData', () => {
      it('should render', async () => {
        const TestCmp = componentQrl(
          inlinedQrl(() => {
            const myKey = useServerData<string>('my-key');
            const defaultKey = useServerData<string>('other-key', 'default-value');
            return (
              <span>
                {myKey}/{defaultKey}
              </span>
            );
          }, 's_cmp1')
        );

        const result = await renderToString2(<TestCmp />, {
          containerTagName: 'div',
          serverData: { 'my-key': 'my-value' },
        });
        const document = createDocument(result.html);
        const componentElement = document.body.firstChild;
        expect(componentElement?.firstChild?.textContent).toEqual('my-value/default-value');
      });
    });
    describe('manifest/symbolMapper', () => {
      it('should render', async () => {
        const testManifest: QwikManifest = {
          manifestHash: 'test-manifest-hash',
          symbols: {
            symbol1: {
              canonicalFilename: 'symbol1filename',
              captures: false,
              ctxKind: 'event',
              ctxName: 'symbol1ctxname',
              displayName: 'symbol1displayname',
              hash: 'symbol1hash',
              loc: [0, 0],
              origin: 'symbol1origin',
              parent: null,
            },
          },
          bundles: {
            bundle1: {
              size: 1,
              dynamicImports: [],
            },
          },
          mapping: {
            counter: 'counter.js',
          },
          version: '1',
        };
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          manifest: testManifest,
        });
        expect(result.manifest).toEqual(testManifest);
      });
      it('should render manifest hash attribute', async () => {
        const testManifestHash = 'testManifestHash';
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          manifest: {
            ...defaultManifest,
            manifestHash: testManifestHash,
          },
        });
        expect(result.html.includes(`q:manifest-hash="${testManifestHash}"`)).toBeTruthy();
      });
    });
    describe('debug', () => {
      it('should emit qwik loader with debug mode', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          debug: true,
        });
        expect(result.html).toContain('<script id="qwikloader">debug</script>');
      });

      it('should emit qwik loader without debug mode', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
          debug: false,
        });
        expect(result.html).toContain('<script id="qwikloader">min</script>');
      });
    });
    describe('snapshotResult', () => {
      it('should contain resources', async () => {
        const ResourceComponent = componentQrl(
          inlinedQrl(() => {
            const rsrc = useResourceQrl(inlinedQrl(() => 'RESOURCE_VALUE', 's_resource'));
            return (
              <div>
                <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
              </div>
            );
          }, 's_cmpResource')
        );
        const result = await renderToString2(
          <body>
            <ResourceComponent />
          </body>,
          {
            containerTagName: 'html',
          }
        );
        expect(result.snapshotResult?.qrls).toHaveLength(0);
        expect(result.snapshotResult?.resources).toHaveLength(1);
        expect(result.snapshotResult?.funcs).toHaveLength(0);
      });
      it('should contain qrls and resources', async () => {
        const ResourceAndSignalComponent = componentQrl(
          inlinedQrl(() => {
            const sig = useSignal(0);
            const rsrc = useResourceQrl(inlinedQrl(() => 'RESOURCE_VALUE', 's_resource'));
            return (
              <button
                onClick$={inlinedQrl(
                  () => {
                    const [sig] = useLexicalScope();
                    sig.value++;
                  },
                  's_click',
                  [sig]
                )}
              >
                <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
                {sig.value}
              </button>
            );
          }, 's_cmpResourceSignal')
        );
        const result = await renderToString2(
          <body>
            <ResourceAndSignalComponent />
          </body>,
          {
            containerTagName: 'html',
          }
        );
        expect(result.snapshotResult?.qrls).toHaveLength(1);
        expect(result.snapshotResult?.resources).toHaveLength(1);
        expect(result.snapshotResult?.funcs).toHaveLength(0);
      });
      it('should contain qrls', async () => {
        const FunctionComponent = componentQrl(
          inlinedQrl(() => {
            const sig = useSignal(0);
            const fn = (v: number) => 'aaa' + v;
            return (
              <button
                onClick$={inlinedQrl(
                  () => {
                    const [sig] = useLexicalScope();
                    sig.value++;
                  },
                  's_click',
                  [sig]
                )}
              >
                {fn(sig.value)}
              </button>
            );
          }, 's_cmpFunction')
        );
        const result = await renderToString2(<FunctionComponent />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.qrls).toHaveLength(1);
        expect(result.snapshotResult?.resources).toHaveLength(0);
        expect(result.snapshotResult?.funcs).toHaveLength(0);
      });
      it('should contain qrls and funcs', async () => {
        const CounterDerived = component$((props: { initial: number }) => {
          const count = useSignal(props.initial);
          return (
            <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
              Count: {_fnSignal((p0) => p0.value, [count], 'p0.value')}!
            </button>
          );
        });
        const result = await renderToString2(
          <body>
            <CounterDerived initial={123} />
          </body>,
          {
            containerTagName: 'html',
          }
        );
        expect(result.snapshotResult?.qrls).toHaveLength(1);
        expect(result.snapshotResult?.resources).toHaveLength(0);
        expect(result.snapshotResult?.funcs).toHaveLength(1);
      });
      it('should set static mode', async () => {
        let result = await renderToString2(<div>static content</div>, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('static');

        const StaticComponent = componentQrl(
          inlinedQrl(() => {
            return <div>static content</div>;
          }, 's_static')
        );

        result = await renderToString2(<StaticComponent />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('static');
      });
      it('should set listeners mode', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('listeners');
      });
      it.todo('should set render mode', async () => {
        const ComponentA = componentQrl(
          inlinedQrl(() => {
            const test = useSignal(0);
            const fn = (a: number) => a + 'abcd';

            return (
              <div>
                <button
                  onClick$={inlinedQrl(
                    () => {
                      const [test] = useLexicalScope();
                      test.value++;
                    },
                    's_click',
                    [test]
                  )}
                >
                  Test
                </button>
                {fn(test.value)}
              </div>
            );
          }, 's_comp')
        );

        const result = await renderToString2(<ComponentA />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('render');
      });
    });
  });
  describe('renderToStream()', () => {
    describe('render result', () => {
      it.todo('should render', async () => {});
    });
    describe('stream', () => {
      it.todo('should render');
    });
    describe('streaming', () => {
      it.todo('should render');
    });
  });
});
