import {
  DEVTOOLS_MESSAGES,
  QWIK_DEVTOOLS_GLOBAL,
  QWIK_VNODE_PROTOCOL,
} from '@qwik.dev/devtools/kit';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  __qwik_install_vnode_runtime__,
  type VNodeRuntimeInternals,
  type VNodeRuntimeOptions,
} from './installers';

/**
 * These tests exercise the canonical VNode bridge (`__qwik_install_vnode_runtime__`) that both the
 * Vite plugin virtual module and the browser extension's generated `vnode-bridge.js` are built
 * from. Rather than depending on a real Qwik container, they feed hand-built fixture VNode trees
 * through fake `@qwik.dev/core/internal` helpers, so tree building, prop serialization, name
 * normalization, and DOM resolution are all covered without a browser.
 */

const OPTIONS: VNodeRuntimeOptions = {
  chunkKey: QWIK_VNODE_PROTOCOL.qrl.chunk,
  componentTreeUpdateType: DEVTOOLS_MESSAGES.types.componentTreeUpdate,
  devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
  hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
  pageMessageSource: DEVTOOLS_MESSAGES.pageSource,
  qColon: QWIK_VNODE_PROTOCOL.attrs.colon,
  qId: QWIK_VNODE_PROTOCOL.attrs.id,
  qKey: QWIK_VNODE_PROTOCOL.attrs.key,
  qProps: QWIK_VNODE_PROTOCOL.attrs.props,
  qRenderFn: QWIK_VNODE_PROTOCOL.attrs.renderFn,
  qType: QWIK_VNODE_PROTOCOL.attrs.type,
  symbolKey: QWIK_VNODE_PROTOCOL.qrl.symbol,
  untrackedValueKey: QWIK_VNODE_PROTOCOL.qrl.untrackedValue,
};

type AnyRecord = Record<string, any>;

/** Minimal fake VNode. Only the fields the runtime reads are modelled. */
interface FakeVNode {
  virtual?: boolean;
  materialized?: boolean;
  firstChild?: FakeVNode | null;
  nextSibling?: FakeVNode | null;
  node?: any;
  attrKeys?: string[];
  host?: AnyRecord;
}

interface ComponentOptions {
  qId?: string;
  colonId?: string;
  chunk?: string;
  devFile?: string;
  props?: AnyRecord;
  node?: any;
  child?: FakeVNode | null;
  sibling?: FakeVNode | null;
}

/** Build a virtual component VNode whose render function reports `symbol`. */
function componentVNode(symbol: string, opts: ComponentOptions = {}): FakeVNode {
  const renderFn: any = () => {};
  renderFn.getSymbol = () => symbol;
  if (opts.chunk) {
    renderFn[OPTIONS.chunkKey] = opts.chunk;
  }
  if (opts.devFile) {
    renderFn.dev = { file: opts.devFile };
  }
  const attrKeys = [OPTIONS.qType];
  const host: AnyRecord = { [OPTIONS.qRenderFn]: renderFn };
  if (opts.qId != null) {
    attrKeys.push(OPTIONS.qId);
    host[OPTIONS.qId] = opts.qId;
  }
  if (opts.colonId != null) {
    attrKeys.push(OPTIONS.qColon);
    host[OPTIONS.qColon] = opts.colonId;
  }
  if (opts.props) {
    host[OPTIONS.qProps] = opts.props;
  }
  return {
    virtual: true,
    host,
    attrKeys,
    node: opts.node,
    firstChild: opts.child ?? null,
    nextSibling: opts.sibling ?? null,
  };
}

let posted: AnyRecord[];

/** Installs the bridge against a fixture root VNode and returns the augmented hook. */
function installBridge(rootVNode: FakeVNode | null): AnyRecord {
  const container: AnyRecord = {
    rootVNode,
    getHostProp: (vnode: FakeVNode, prop: string) => vnode.host?.[prop],
  };
  const internals: VNodeRuntimeInternals = {
    _getDomContainer: () => container,
    _vnode_getFirstChild: (vnode: any) => vnode.firstChild ?? null,
    _vnode_isVirtualVNode: (vnode: any) => !!vnode.virtual,
    _vnode_isMaterialized: (vnode: any) => !!vnode.materialized,
    _vnode_getAttrKeys: (_container: any, vnode: any) => vnode.attrKeys ?? [],
  };
  __qwik_install_vnode_runtime__(OPTIONS, internals);
  return (globalThis as any).window[OPTIONS.devtoolsGlobalKey][OPTIONS.hookKey];
}

describe('__qwik_install_vnode_runtime__', () => {
  beforeEach(() => {
    posted = [];
    const created: any[] = [];
    (globalThis as any).window = {
      [OPTIONS.devtoolsGlobalKey]: { [OPTIONS.hookKey]: {} },
      postMessage: (message: AnyRecord) => posted.push(message),
    };
    (globalThis as any).document = {
      readyState: 'complete',
      documentElement: {},
      addEventListener() {},
      getElementById: (id: string) => created.find((el) => el.id === id) ?? null,
      createElement: () => {
        const el: any = { id: '', style: {}, textContent: '', appendChild() {} };
        created.push(el);
        return el;
      },
      body: { appendChild() {} },
    };
    (globalThis as any).MutationObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
  });

  test('getVNodeTree builds a nested tree with normalized names, ids, and QRL metadata', () => {
    const child = componentVNode('Counter_component', {
      qId: '1',
      chunk: 'src/counter_component_y',
    });
    const root = componentVNode('App_component', {
      qId: '0',
      chunk: 'src/app_component_x',
      devFile: 'src/app.tsx',
      child,
    });
    const tree = installBridge(root).getVNodeTree();

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      name: 'App',
      id: 'q-0',
      label: 'App',
      props: { [OPTIONS.qId]: '0', __qrlChunk: 'src/app', __qrlPath: 'src/app.tsx' },
    });
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({
      name: 'Counter',
      id: 'q-1',
      props: { [OPTIONS.qId]: '1', __qrlChunk: 'src/counter' },
    });
  });

  test('getVNodeTree assigns synthetic ids to components without a q:id', () => {
    const root = componentVNode('Widget_component');
    const tree = installBridge(root).getVNodeTree();
    expect(tree[0].name).toBe('Widget');
    expect(tree[0].id).toBe('vnode-0');
  });

  test('getVNodeTree filters out the devtools overlay components', () => {
    const overlay = componentVNode('Qwikdevtools', {
      sibling: componentVNode('Counter_component', { qId: '3' }),
    });
    const tree = installBridge(overlay).getVNodeTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Counter');
  });

  test('getVNodeTree hoists children through non-component wrapper nodes', () => {
    const counter = componentVNode('Counter_component', { qId: '7' });
    const materializedWrapper: FakeVNode = { materialized: true, firstChild: counter };
    const virtualWrapper: FakeVNode = { virtual: true, host: {}, firstChild: materializedWrapper };
    const tree = installBridge(virtualWrapper).getVNodeTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: 'Counter', id: 'q-7' });
  });

  test('getVNodeTree returns null when there is no root VNode', () => {
    expect(installBridge(null).getVNodeTree()).toBeNull();
  });

  test('getNodeProps serializes props, unwraps signals, and drops QRLs and listeners', () => {
    const props = {
      title: 'Hello',
      count: 3,
      onClick$: () => {},
      'on:click': () => {},
      'on$:mount': () => {},
      qrlRef: { [OPTIONS.chunkKey]: 'chunk-abc' },
      signal: { [OPTIONS.untrackedValueKey]: 42 },
      nested: { a: 1 },
    };
    const hook = installBridge(componentVNode('Counter_component', { qId: '9', props }));
    hook.getVNodeTree();

    expect(hook.getNodeProps('q-9')).toEqual({
      title: 'Hello',
      count: 3,
      onClick$: '[Function]',
      qrlRef: '[QRL]',
      signal: 42,
      nested: { a: 1 },
    });
  });

  test('getNodeProps returns null for an unknown node id', () => {
    const hook = installBridge(componentVNode('Counter_component', { qId: '9' }));
    hook.getVNodeTree();
    expect(hook.getNodeProps('q-does-not-exist')).toBeNull();
  });

  test('resolveElementToComponent maps a data-qwik-inspector element to its node id', () => {
    const hook = installBridge(componentVNode('Counter_component', { qId: '2' }));
    hook.getVNodeTree();
    const el = {
      getAttribute: (attr: string) =>
        attr === 'data-qwik-inspector' ? 'src/routes/Counter.tsx:3:5' : null,
      parentElement: null,
    };
    expect(hook.resolveElementToComponent(el)).toBe('q-2');
    expect(hook.resolveElementToComponent(null)).toBeNull();
  });

  test('getElementRect returns the bounding rect of the resolved DOM element', () => {
    const node = { getBoundingClientRect: () => ({ top: 1, left: 2, width: 3, height: 4 }) };
    const hook = installBridge(componentVNode('Counter_component', { qId: '4', node }));
    hook.getVNodeTree();
    expect(hook.getElementRect('q-4')).toEqual({ top: 1, left: 2, width: 3, height: 4 });
    expect(hook.getElementRect('missing')).toBeNull();
  });

  test('highlightNode / unhighlightNode toggle an overlay for a known node', () => {
    const node = { getBoundingClientRect: () => ({ top: 0, left: 0, width: 10, height: 10 }) };
    const hook = installBridge(componentVNode('Counter_component', { qId: '4', node }));
    hook.getVNodeTree();
    expect(hook.highlightNode('q-4', 'Counter')).toBe(true);
    expect(hook.highlightNode('missing', 'X')).toBe(false);
    expect(() => hook.unhighlightNode()).not.toThrow();
  });

  test('setupBridge posts the initial component tree to the page', () => {
    installBridge(componentVNode('Counter_component', { qId: '1' }));
    const treeMessage = posted.find((m) => m.type === OPTIONS.componentTreeUpdateType);
    expect(treeMessage).toBeDefined();
    expect(treeMessage!.source).toBe(OPTIONS.pageMessageSource);
    expect(treeMessage!.tree[0]).toMatchObject({ name: 'Counter', id: 'q-1' });
  });
});
