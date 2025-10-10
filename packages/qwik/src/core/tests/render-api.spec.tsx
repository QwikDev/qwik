import {
  Fragment as Component,
  Resource,
  Fragment as Signal,
  component$,
  componentQrl,
  createContextId,
  getDomContainer,
  getPlatform,
  inlinedQrl,
  render,
  setPlatform,
  useContextProvider,
  useLexicalScope,
  useOn,
  useResource$,
  useResourceQrl,
  useServerData,
  useSignal,
  useTask$,
  type JSXOutput,
} from '@qwik.dev/core';
import type { GlobalInjections, QwikManifest } from '@qwik.dev/core/optimizer';
import { renderToStream, renderToString } from '@qwik.dev/core/server';
import {
  createDocument,
  emulateExecutionOfQwikFuncs,
  getTestPlatform,
  trigger,
} from '@qwik.dev/core/testing';
import { cleanupAttrs } from 'packages/qwik/src/testing/element-fixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  StreamWriter,
  StreamingOptions,
} from '../../server/types';
import {
  _fnSignal,
  _getDomContainer,
  type _ContainerElement,
  type _DomContainer,
} from '../internal';
import { vnode_getFirstChild } from '../client/vnode';
import { QContainerValue } from '../shared/types';
import { QContainerAttr } from '../shared/utils/markers';

vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

const mapping = {
  click: 'click.js',
  s_counter: 's_counter.js',
  s_click: 's_click.js',
  // Our internal symbols
  _run: 'core',
  _task: 'core',
};

const defaultManifest: QwikManifest = {
  manifestHash: 'manifest-hash',
  symbols: {},
  bundles: {},
  mapping,
  version: '1',
  preloader: 'preloader.js',
};
const manifestWithHelpers = {
  ...defaultManifest,
  core: 'core.js',
  preloader: 'preloader.js',
  qwikLoader: 'qwik-loader.js',
  bundleGraphAsset: 'assets/bundle-graph.json',
};

const ManyEventsComponent = component$(() => {
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
      <button onClick$={inlinedQrl(() => {}, 's_click2')} onBlur$={inlinedQrl(() => {}, 's_blur1')}>
        click
      </button>
    </div>
  );
});

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

const renderToStringAndSetPlatform = async (jsx: JSXOutput, opts: RenderToStringOptions = {}) => {
  const platform = getPlatform();
  let result: RenderToStringResult;
  try {
    result = await renderToString(jsx, { qwikLoader: 'never', ...opts });
  } finally {
    setPlatform(platform);
  }
  return result;
};

const renderToStreamAndSetPlatform = async (jsx: JSXOutput, opts: RenderToStreamOptions) => {
  const platform = getPlatform();
  let result: RenderToStreamResult;
  try {
    result = await renderToStream(jsx, { qwikLoader: 'never', ...opts });
  } finally {
    setPlatform(platform);
  }
  return result;
};

describe('render api', () => {
  let document: Document;
  beforeEach(() => {
    document = createDocument();
  });

  describe('render()', () => {
    it('should render counter', async () => {
      await render(document.body, <Counter />);
      await getTestPlatform().flush();
      const container = getDomContainer(document.body);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal>123</Signal>
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal>124</Signal>
          </button>
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
      await render(document.body, <TestCmp />, { serverData: { 'my-key': 'my-value' } });
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
      const { cleanup } = await render(document.body, <TestCmp />, {
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
      const result = await renderToStringAndSetPlatform(<TestCmp />, {
        containerTagName: 'div',
      });
      document = createDocument({ html: result.html });
      emulateExecutionOfQwikFuncs(document);
      const container = getDomContainer(document.body.firstChild as HTMLElement);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <button>
          <Signal ssr-required>123</Signal>
        </button>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <button>
          <Signal ssr-required>124</Signal>
        </button>
      );
    });
    describe('render result', () => {
      it('should render', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          manifest: defaultManifest,
        });
        expect(result).toMatchObject({
          isStatic: true,
          timing: expect.any(Object),
          manifest: expect.any(Object),
          snapshotResult: expect.any(Object),
          html: expect.any(String),
        });
      });

      it('should have timings greater than 0', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
        });
        const timing = result.timing;
        expect(timing).toMatchObject({
          firstFlush: expect.any(Number),
          render: expect.any(Number),
          snapshot: expect.any(Number),
        });
        expect(timing.firstFlush).toBeGreaterThan(0);
        expect(timing.render).toBeGreaterThan(0);
        expect(timing.snapshot).toBeGreaterThan(0);
      });

      it('should escape invalid characters', async () => {
        const Cmp = componentQrl(
          inlinedQrl(() => {
            const obj = {
              a: '123',
              b: '<script />',
              c: '&foo',
            };
            return (
              <div data-amp="foo&bar" data-lt="foo<bar" data-gt="foo>bar" data-a='"' data-b="'">
                {JSON.stringify(obj)}
              </div>
            );
          }, 's_counter')
        );
        const result = await renderToStringAndSetPlatform(<Cmp />, {
          containerTagName: 'div',
          manifest: defaultManifest,
        });
        expect(cleanupAttrs(result.html)).toContain(
          `<div data-amp="foo&amp;bar" data-lt="foo&lt;bar" data-gt="foo&gt;bar" data-a="&quot;" data-b="&#39;">{&quot;a&quot;:&quot;123&quot;,&quot;b&quot;:&quot;&lt;script /&gt;&quot;,&quot;c&quot;:&quot;&amp;foo&quot;}</div>`
        );
      });
    });
    describe('version', () => {
      afterEach(async () => {
        // restore default value
        const version = await import('../version');
        vi.spyOn(version, 'version', 'get').mockReturnValue('dev');
      });

      it('should render', async () => {
        const testVersion = 'qwik-v-test123';
        const version = await import('../version');
        vi.spyOn(version, 'version', 'get').mockReturnValue(testVersion);
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
        });
        expect(result.html).toContain(`q:version="${testVersion}"`);
        vi.clearAllMocks();
      });
    });
    describe('container', () => {
      it('should render', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
        });
        const document = createDocument({ html: result.html });
        const containerElement = document.querySelector('[q\\:container]') as _ContainerElement;
        emulateExecutionOfQwikFuncs(document);

        expect(containerElement.getAttribute(QContainerAttr)).toEqual(QContainerValue.PAUSED);
        await trigger(containerElement, 'button', 'click');
        expect(containerElement.getAttribute(QContainerAttr)).toEqual(QContainerValue.RESUMED);
      });
    });
    describe('base', () => {
      it('should render', async () => {
        const testBase = '/abcd/123-test/';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          base: testBase,
        });
        expect(result.html).toContain(`q:base="${testBase}"`);
      });
    });
    describe('locale', () => {
      it('should render', async () => {
        const testLocale = 'pl';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          locale: testLocale,
        });
        expect(result.html).toContain(`q:locale="${testLocale}"`);
      });
      it('should render for function', async () => {
        const testLocale = 'pl';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          locale: () => testLocale,
        });
        expect(result.html).toContain(`q:locale="${testLocale}"`);
      });
      it('should render from serverData', async () => {
        const testLocale = 'pl';
        const testServerDataLocale = 'en';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          locale: testLocale,
          serverData: {
            locale: testServerDataLocale,
          },
        });
        expect(result.html).toContain(`q:locale="${testServerDataLocale}"`);
      });
      it('should render from containerAttributes', async () => {
        const testLocale = 'en-us';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          containerAttributes: {
            locale: testLocale,
          },
        });
        expect(result.html).toContain(`q:locale="${testLocale}"`);
      });
    });
    describe('qwikLoader', () => {
      describe('inline', () => {
        it('should render at bottom as fallback', async () => {
          const result = await renderToStringAndSetPlatform(<Counter />, {
            containerTagName: 'div',
            qwikLoader: 'inline',
          });
          const document = createDocument({ html: result.html });
          // qwik loader is one before last
          const qwikLoaderScriptElement = document.body.firstChild?.lastChild
            ?.previousSibling as HTMLElement;
          expect(qwikLoaderScriptElement?.tagName.toLowerCase()).toEqual('script');
          expect(qwikLoaderScriptElement?.getAttribute('id')).toEqual('qwikloader');
          // qwik events should be the last script of body
          const eventsScriptElement = document.body.lastChild as HTMLElement;
          expect(eventsScriptElement.textContent).toContain(
            '(window.qwikevents||(window.qwikevents=[]))'
          );
        });
        it('should not render for static content and auto include', async () => {
          const result = await renderToStringAndSetPlatform(<div>static</div>, {
            containerTagName: 'div',
            qwikLoader: 'inline',
          });
          const document = createDocument({ html: result.html });
          // should not contain qwik events script for top position
          expect(document.head.lastChild?.textContent ?? '').not.toContain(
            'window.qwikevents.push'
          );
          expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(0);
        });
        it('should render after 30kB of SSR', async () => {
          const bigText = 'hello world '.repeat(3000); // ~30kB of text
          const result = await renderToStringAndSetPlatform(
            <div>
              <Counter />
              <div>{bigText}</div>
              <div>{bigText}</div>
            </div>,
            {
              containerTagName: 'div',
              qwikLoader: 'inline',
            }
          );
          const document = createDocument({ html: result.html });
          expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(1);
          const notQwikLoaderScriptElement = document.body.firstChild?.lastChild
            ?.previousSibling as HTMLElement;
          expect(notQwikLoaderScriptElement?.id).not.toEqual('qwikloader');
          // qwik events should still be the last script of body
          const eventsScriptElement = document.body.lastChild as HTMLElement;
          expect(eventsScriptElement.textContent).toContain(
            '(window.qwikevents||(window.qwikevents=[]))'
          );
        });
        it('should not render inside template', async () => {
          const bigText = 'hello world '.repeat(3000); // ~30kB of text
          const result = await renderToStringAndSetPlatform(
            <div>
              <Counter />
              <table>
                <tbody>
                  <tr>
                    <td>
                      <template>
                        <div>{bigText}</div>
                        {bigText}
                      </template>
                    </td>
                  </tr>
                  <tr>
                    <td>Before here is safe</td>
                  </tr>
                </tbody>
              </table>
            </div>,
            {
              containerTagName: 'div',
              qwikLoader: 'inline',
            }
          );
          const document = createDocument({ html: result.html });
          expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(1);
          const notQwikLoaderScriptElement = document.body.firstChild?.lastChild
            ?.previousSibling as HTMLElement;
          expect(notQwikLoaderScriptElement?.id).not.toEqual('qwikloader');
          // qwik events should still be the last script of body
          const eventsScriptElement = document.body.lastChild as HTMLElement;
          expect(eventsScriptElement.textContent).toContain(
            '(window.qwikevents||(window.qwikevents=[]))'
          );
        });
      });
      it('should support never render', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          qwikLoader: 'never',
        });
        const document = createDocument({ html: result.html });
        expect(document.querySelectorAll('script[id=qwikloader]')).toHaveLength(0);
      });
    });
    describe('qwikEvents', () => {
      it('should render', async () => {
        const result = await renderToStringAndSetPlatform(<ManyEventsComponent />, {
          containerTagName: 'div',
          qwikLoader: 'module',
        });
        expect(result.html).toContain(
          '(window.qwikevents||(window.qwikevents=[])).push("focus", "click", "dblclick", "blur")'
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
        const result = await renderToStringAndSetPlatform(<CounterDerived initial={123} />, {
          containerTagName: 'div',
        });
        const document = createDocument({ html: result.html });
        const qwikFuncScriptElements = document.querySelectorAll('script[q\\:func=qwik/json]');
        expect(qwikFuncScriptElements).toHaveLength(1);
        expect(qwikFuncScriptElements[0].textContent).toMatch(
          /document\["qFuncs_(\w+)"\]=\[\(p0\)=>p0\.value\]/
        );
      });
    });
    describe('preloader', () => {
      // we need a test with a built manifest
      it('should render', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          manifest: defaultManifest,
        });
        const document = createDocument({ html: result.html });
        const preloadScript = document.querySelectorAll('script[q\\:type=preload]');
        expect(preloadScript).toHaveLength(1);
        expect(preloadScript[0]?.textContent).toContain(`import(`);
        // no bundlegraph because no manifest
        // expect(preloadScript[0]?.textContent).toContain(`bundle-graph`);
        expect(document.querySelectorAll('link')).toHaveLength(0);
      });
    });
    describe('containerTagName/containerAttributes', () => {
      it('should render correct container tag name', async () => {
        const testTag = 'test-tag';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: testTag,
        });
        const document = createDocument({ html: result.html });
        expect(document.body.firstChild?.nodeName.toLowerCase()).toEqual(testTag);
      });
      it('should render qwik loader and preloader for custom tag name', async () => {
        const testTag = 'test-tag';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: testTag,
          manifest: manifestWithHelpers,
          qwikLoader: 'module',
        });
        const document = createDocument({ html: result.html });
        const containerElement = document.body.firstChild;
        expect(containerElement?.nodeName.toLowerCase()).toEqual(testTag);
        expect(containerElement?.lastChild?.textContent ?? '').toContain('window.qwikevents');
        const scripts = document.querySelectorAll('script');
        expect(scripts[0]?.getAttribute('src')).toEqual('/build/qwik-loader.js');
        expect(scripts[1]?.innerHTML).toContain('/build/preloader.js');
        expect(scripts[4]?.innerHTML).toContain('/build/preloader.js');
        const links = document.querySelectorAll('link');
        expect(links[0]?.getAttribute('href')).toEqual('/build/qwik-loader.js');
        expect(links[0]?.getAttribute('rel')).toEqual('modulepreload');
        expect(links[1]?.getAttribute('href')).toEqual('/build/preloader.js');
        expect(links[1]?.getAttribute('rel')).toEqual('modulepreload');
        expect(links[2]?.getAttribute('href')).toEqual('/assets/bundle-graph.json');
        expect(links[2]?.getAttribute('rel')).toEqual('preload');
        expect(links[2]?.getAttribute('as')).toEqual('fetch');
        expect(links[3]?.getAttribute('href')).toEqual('/build/core.js');
        expect(links[3]?.getAttribute('rel')).toEqual('modulepreload');
      });
      it('should render custom container attributes', async () => {
        const testAttrName = 'test-attr';
        const testAttrValue = 'test-value';
        const result = await renderToStringAndSetPlatform(<Counter />, {
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
          const qDev = await import('../shared/utils/qdev');
          vi.spyOn(qDev, 'qDev', 'get').mockReturnValue(true);
        });
        it('should render qRender with "ssr-dev" value in dev mode', async () => {
          const result = await renderToStringAndSetPlatform(<Counter />, {
            containerTagName: 'div',
          });
          expect(result.html.includes('q:render="ssr-dev"')).toBeTruthy();
        });
        it('should render qRender with "ssr" value in prod mode', async () => {
          const qDev = await import('../shared/utils/qdev');
          vi.spyOn(qDev, 'qDev', 'get').mockReturnValue(false);

          const result = await renderToStringAndSetPlatform(<Counter />, {
            containerTagName: 'div',
          });
          expect(result.html.includes('q:render="ssr-dev"')).toBeTruthy();
        });
        it('should render qRender with custom value in dev mode', async () => {
          const testRender = 'ssr-test';
          const result = await renderToStringAndSetPlatform(<Counter />, {
            containerTagName: 'div',
            containerAttributes: {
              'q:render': testRender,
            },
          });
          expect(result.html.includes(`q:render="${testRender}-ssr-dev"`)).toBeTruthy();
        });
        it('should render qRender with custom value in prod mode', async () => {
          const qDev = await import('../shared/utils/qdev');
          vi.spyOn(qDev, 'qDev', 'get').mockReturnValue(false);

          const testRender = 'ssr-test';
          const result = await renderToStringAndSetPlatform(<Counter />, {
            containerTagName: 'div',
            containerAttributes: {
              'q:render': testRender,
            },
          });
          expect(result.html.includes(`q:render="${testRender}-ssr-dev"`)).toBeTruthy();
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

        const result = await renderToStringAndSetPlatform(<TestCmp />, {
          containerTagName: 'div',
          serverData: { 'my-key': 'my-value' },
        });
        const document = createDocument({ html: result.html });
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
              ctxKind: 'eventHandler',
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
              total: 1,
              dynamicImports: [],
            },
          },
          mapping,
          version: '1',
        };
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          manifest: testManifest,
        });
        expect(result.manifest).toEqual(testManifest);
      });
      it('should render manifest hash attribute', async () => {
        const testManifestHash = 'testManifestHash';
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          manifest: {
            ...defaultManifest,
            manifestHash: testManifestHash,
          },
        });
        expect(result.html.includes(`q:manifest-hash="${testManifestHash}"`)).toBeTruthy();
      });
      it('should render manifest injections', async () => {
        const cssContent = 'body { color: red; }';
        const cssPath = '/path/to/style.css';
        const scriptPath = '/path/to/script.js';
        const result = await renderToStringAndSetPlatform(
          <>
            <head></head>
            <body>test</body>
          </>,
          {
            containerTagName: 'html',
            prefetchStrategy: {
              symbolsToPrefetch: 'auto',
            },
            manifest: {
              ...defaultManifest,
              injections: [
                {
                  location: 'head',
                  tag: 'style',
                  attributes: {
                    'data-src': cssPath,
                    dangerouslySetInnerHTML: cssContent,
                  },
                },
                {
                  location: 'body',
                  tag: 'script',
                  attributes: {
                    id: 'script123',
                    src: scriptPath,
                  },
                },
              ] as GlobalInjections[],
            },
          }
        );
        const document = createDocument({ html: result.html });
        const style = document.head.querySelector('style');
        expect(style?.getAttribute('data-src')).toEqual(cssPath);
        expect(style?.innerHTML).toEqual(cssContent);
        expect(style?.parentNode?.nodeName.toLowerCase()).toEqual('head');

        const script = document.body.querySelector('#script123');
        expect(script?.getAttribute('src')).toEqual(scriptPath);
        expect(script?.parentNode?.nodeName.toLowerCase()).toEqual('body');
      });
    });
    describe('debug', () => {
      it('should emit qwik loader with debug mode', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          debug: true,
          qwikLoader: 'inline',
        });
        expect(cleanupAttrs(result.html)).toContain(
          '<script id="qwikloader" async type="module">debug</script>'
        );
      });

      it('should emit qwik loader without debug mode', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          debug: false,
          qwikLoader: 'inline',
        });
        expect(cleanupAttrs(result.html)).toContain(
          '<script id="qwikloader" async type="module">min</script>'
        );
      });
    });
    describe('snapshotResult', () => {
      it('should contain resources', async () => {
        const ctxId = createContextId<any>('foo');
        const ResourceComponent = component$(() => {
          const rsrc = useResourceQrl(inlinedQrl(() => 'RESOURCE_VALUE', 's_resource'));
          // refer to the resource so it's not optimized away
          useContextProvider(ctxId, rsrc);
          return (
            <div>
              <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
            </div>
          );
        });
        const result = await renderToStringAndSetPlatform(
          <body>
            <ResourceComponent />
          </body>,
          {
            containerTagName: 'html',
          }
        );
        expect(result.snapshotResult?.qrls).toHaveLength(1);
        expect(result.snapshotResult?.resources).toHaveLength(1);
        expect(result.snapshotResult?.funcs).toHaveLength(0);
      });
      it('should contain qrls and resources', async () => {
        const ResourceAndSignalComponent = component$(() => {
          const sig = useSignal(0);
          // the resource should be dynamic to be added to the snapshot,
          // so we use the track function for that
          const rsrc = useResource$(({ track }) => track(sig));
          return (
            <button
              onClick$={() => {
                sig.value++;
              }}
            >
              <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
              {sig.value + 'test'}
            </button>
          );
        });
        const result = await renderToStringAndSetPlatform(
          <body>
            <ResourceAndSignalComponent />
          </body>,
          {
            containerTagName: 'html',
          }
        );
        expect(result.snapshotResult?.qrls).toHaveLength(3);
        expect(result.snapshotResult?.resources).toHaveLength(1);
        expect(result.snapshotResult?.funcs).toHaveLength(1);
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
        const result = await renderToStringAndSetPlatform(<FunctionComponent />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.qrls).toHaveLength(2);
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
        const result = await renderToStringAndSetPlatform(
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
        let result = await renderToStringAndSetPlatform(<div>static content</div>, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('static');

        const StaticComponent = componentQrl(
          inlinedQrl(() => {
            return <div>static content</div>;
          }, 's_static')
        );

        result = await renderToStringAndSetPlatform(<StaticComponent />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('static');
      });
      it('should set listeners mode', async () => {
        const result = await renderToStringAndSetPlatform(<Counter />, {
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

        const result = await renderToStringAndSetPlatform(<ComponentA />, {
          containerTagName: 'div',
        });
        expect(result.snapshotResult?.mode).toEqual('render');
      });
    });
  });

  describe('renderToStream()', () => {
    describe('render result', () => {
      it('should renderToStream', async () => {
        const chunks: string[] = [];
        const stream: StreamWriter = {
          write(chunk) {
            chunks.push(chunk);
          },
        };
        await renderToStreamAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          stream,
        });
        document = createDocument({ html: chunks.join('') });
        emulateExecutionOfQwikFuncs(document);
        const container = getDomContainer(document.body.firstChild as HTMLElement);
        const vNode = vnode_getFirstChild(container.rootVNode);
        expect(vNode).toMatchVDOM(
          <button>
            <Signal ssr-required>123</Signal>
          </button>
        );
        await trigger(container.element, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <button>
            <Signal ssr-required>124</Signal>
          </button>
        );
      });
    });
    describe('stream', () => {
      it('should render', async () => {
        const stream: StreamWriter = {
          write: vi.fn(),
        };
        await renderToStreamAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          stream,
        });
        expect(stream.write).toHaveBeenCalled();
      });
    });
    describe('streaming', () => {
      it('should render all at once', async () => {
        const write = vi.fn();
        const stream: StreamWriter = { write };
        const streaming: StreamingOptions = {
          inOrder: {
            strategy: 'disabled',
          },
        };
        await renderToStreamAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          stream,
          streaming,
        });
        expect(stream.write).toHaveBeenCalledTimes(1);
      });
      it('should render by direct streaming', async () => {
        const write = vi.fn();
        const stream: StreamWriter = { write };
        const streaming: StreamingOptions = {
          inOrder: {
            strategy: 'direct',
          },
        };
        await renderToStreamAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          stream,
          streaming,
        });
        expect(write.mock.calls.length).toBeGreaterThan(100);
      });
      it('should render chunk by chunk with auto streaming', async () => {
        const stream: StreamWriter = {
          write: vi.fn(),
        };
        const streaming: StreamingOptions = {
          inOrder: {
            strategy: 'auto',
            maximumInitialChunk: 200,
            maximumChunk: 100,
          },
        };
        await renderToStreamAndSetPlatform(<Counter />, {
          containerTagName: 'div',
          stream,
          streaming,
        });
        // This can change when the size of the output changes
        expect(stream.write).toHaveBeenCalledTimes(5);
      });
    });
  });
});
