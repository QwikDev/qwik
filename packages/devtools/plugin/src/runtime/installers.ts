export interface HookRuntimeOptions {
  componentStateKey: string;
  devtoolsGlobalKey: string;
  globalVersion: number;
  hookKey: string;
  signalHookTypes: string[];
}

type RuntimeCallback = (...args: any[]) => any;
type RuntimeRecord = Record<string, any>;

export function __qwik_install_hook_runtime__(options: HookRuntimeOptions) {
  const renderListeners: RuntimeCallback[] = [];
  const signalTypes: Record<string, boolean> = {};
  for (let i = 0; i < options.signalHookTypes.length; i++) {
    signalTypes[options.signalHookTypes[i]] = true;
  }

  const safeSerialize = (val: any): any => {
    if (val === null || val === undefined) {
      return val;
    }
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      return val;
    }
    if (t === 'function') {
      return '[Function]';
    }
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_) {
      return '[' + t + ']';
    }
  };

  const serializeDeep = (val: any, depth: number): any => {
    if (depth > 6) {
      return '[depth limit]';
    }
    if (val === null) {
      return null;
    }
    if (val === undefined) {
      return undefined;
    }
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      return val;
    }
    if (t === 'function') {
      const n = val.name || 'anonymous';
      return { __type: 'function', __name: n };
    }

    try {
      if (val && t === 'object' && '$untrackedValue$' in val) {
        return serializeDeep(val.$untrackedValue$, depth + 1);
      }

      if (Array.isArray(val)) {
        return val.map((item) => serializeDeep(item, depth + 1));
      }

      if (t === 'object') {
        const className = val.constructor ? val.constructor.name : 'Object';
        const result: RuntimeRecord = {};

        if (className !== 'Object') {
          result.__className = className;
          try {
            if (typeof val.toString === 'function' && val.toString !== Object.prototype.toString) {
              result.__display = val.toString();
            }
          } catch (_) {
            // Ignore display string failures for exotic host objects.
          }
        }

        const keys = Object.keys(val);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (key.startsWith('$') && key.endsWith('$')) {
            continue;
          }
          try {
            result[key] = serializeDeep(val[key], depth + 1);
          } catch (_) {
            result[key] = '[unreadable]';
          }
        }

        return result;
      }
    } catch (_) {
      // Fall through to string serialization when deep serialization is unsafe.
    }

    return String(val);
  };

  const readValue = (ref: any): any => {
    try {
      if (ref && typeof ref === 'object' && 'value' in ref) {
        return safeSerialize(ref.value);
      }
      if (ref && typeof ref === 'object') {
        return safeSerialize(ref);
      }
      return undefined;
    } catch (_) {
      return '[error]';
    }
  };

  const getOrCreateRoot = (): RuntimeRecord | undefined => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const win = window as any;
    const root: RuntimeRecord =
      win[options.devtoolsGlobalKey] ||
      (win[options.devtoolsGlobalKey] = {
        version: options.globalVersion,
      });
    root.version = root.version || options.globalVersion;
    root[options.componentStateKey] = root[options.componentStateKey] || {};
    return root;
  };

  const getState = (): RuntimeRecord | undefined => {
    return getOrCreateRoot()?.[options.componentStateKey];
  };

  const findComponentKey = (componentName: string, qrlChunk: string | null): string | null => {
    const state = getState();
    if (!state) {
      return null;
    }
    const keys = Object.keys(state);
    if (qrlChunk) {
      const byChunk = keys.find((key) => key.endsWith(qrlChunk));
      if (byChunk) {
        return byChunk;
      }
    }
    const lowerName = componentName.toLowerCase();
    for (const key of keys) {
      const lastSeg = key.split('/').pop() || key;
      const underIdx = lastSeg.lastIndexOf('_');
      const name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;
      if (name.toLowerCase() === lowerName) {
        return key;
      }
    }
    return null;
  };

  const methods = {
    _emitRender(info: any) {
      for (let i = 0; i < renderListeners.length; i++) {
        try {
          renderListeners[i](info);
        } catch (_) {
          // Ignore listener failures so one consumer cannot break all render notifications.
        }
      }
    },

    getSignalValue(signal: any) {
      if (signal && typeof signal === 'object' && 'value' in signal) {
        return signal.value;
      }
      return undefined;
    },

    getSignalsSnapshot() {
      const state = getState();
      if (!state) {
        return {};
      }
      const snapshot: RuntimeRecord = {};
      for (const path of Object.keys(state)) {
        const hooks = state[path].hooks || [];
        const signals: RuntimeRecord[] = [];
        for (const h of hooks) {
          if (signalTypes[h.hookType] && h.data != null) {
            signals.push({
              name: h.variableName || '',
              hookType: h.hookType,
              value: readValue(h.data),
            });
          }
        }
        if (signals.length > 0) {
          snapshot[path] = signals;
        }
      }
      return snapshot;
    },

    getComponentTreeSnapshot() {
      const state = getState();
      if (!state) {
        return [];
      }

      return Object.keys(state).map((path) => {
        const comp = state[path];
        const hooks = comp.hooks || [];
        const lastSeg = path.split('/').pop() || path;
        const underIdx = lastSeg.lastIndexOf('_');
        const name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;

        const signals: RuntimeRecord[] = [];
        const hookEntries: RuntimeRecord[] = [];
        for (const h of hooks) {
          hookEntries.push({
            variableName: h.variableName || '',
            hookType: h.hookType || '',
            category: h.category || '',
          });
          if (signalTypes[h.hookType] && h.data != null) {
            signals.push({
              name: h.variableName || '',
              hookType: h.hookType,
              value: readValue(h.data),
            });
          }
        }

        return { path, name, signals, hooks: hookEntries };
      });
    },

    onRender(callback: RuntimeCallback) {
      renderListeners.push(callback);
      return () => {
        const idx = renderListeners.indexOf(callback);
        if (idx >= 0) {
          renderListeners.splice(idx, 1);
        }
      };
    },

    getComponentDetail(componentName: string, qrlChunk: string | null) {
      const state = getState();
      const matchingKey = findComponentKey(componentName, qrlChunk);
      if (!state || !matchingKey) {
        return null;
      }
      const comp = state[matchingKey];
      if (!comp || !comp.hooks) {
        return null;
      }

      return comp.hooks
        .filter((h) => h.data != null)
        .map((h) => ({
          hookType: h.hookType || 'unknown',
          variableName: h.variableName || h.hookType || 'unknown',
          data: serializeDeep(h.data, 0),
        }));
    },

    setSignalValue(
      componentName: string,
      qrlChunk: string | null,
      variableName: string,
      newValue: any
    ) {
      const state = getState();
      const matchingKey = findComponentKey(componentName, qrlChunk);
      if (!state || !matchingKey) {
        return false;
      }

      const comp = state[matchingKey];
      if (!comp || !comp.hooks) {
        return false;
      }

      for (const h of comp.hooks) {
        if (h.variableName === variableName && h.data != null) {
          try {
            if (typeof h.data === 'object' && 'value' in h.data) {
              h.data.value = newValue;
              return true;
            }
          } catch (_) {
            // Ignore signal assignment failures for readonly or revoked references.
          }
        }
      }
      return false;
    },

    onSignalUpdate(_callback: RuntimeCallback) {
      return () => {};
    },
  };

  const root = getOrCreateRoot();
  if (!root || root[options.hookKey]) {
    return;
  }
  root[options.hookKey] = {
    version: 1,
    ...methods,
  };
}

export interface PerfRuntimeOptions {
  defaultPerfStore: { ssr: unknown[]; csr: unknown[] };
  devtoolsGlobalKey: string;
  globalVersion: number;
  hookKey: string;
  pageMessageSource: string;
  perfStoreExpression: string;
  perfStoreKey: string;
  renderEventType: string;
  ssrPerfCountKey: string;
  ssrPerfIdKey: string;
  ssrPerfIndexKey: string;
  ssrPerfStoreKey: string;
  csrPhase: string;
  ssrPhase: string;
}

export function __qwik_install_perf_runtime__(options: PerfRuntimeOptions) {
  const isServer = () => typeof window === 'undefined';
  const getSsrStore = (): RuntimeRecord =>
    typeof process !== 'undefined' && process ? (process as any) : (globalThis as RuntimeRecord);
  const getOrCreateRoot = (): RuntimeRecord | undefined => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const win = window as any;
    const root: RuntimeRecord =
      win[options.devtoolsGlobalKey] ||
      (win[options.devtoolsGlobalKey] = {
        version: options.globalVersion,
      });
    root.version = root.version || options.globalVersion;
    return root;
  };

  const initCsr = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const root = getOrCreateRoot()!;
    root[options.perfStoreKey] = root[options.perfStoreKey] || {
      ssr: options.defaultPerfStore.ssr.slice(),
      csr: options.defaultPerfStore.csr.slice(),
    };
    root[options.perfStoreKey]._csrByViteId = root[options.perfStoreKey]._csrByViteId || {};
    root[options.perfStoreKey]._ssrByComponent = root[options.perfStoreKey]._ssrByComponent || {};
  };

  const nextId = (perf: RuntimeRecord) => {
    perf._id = (perf._id || 0) + 1;
    return perf._id;
  };

  const nextSsrId = (store: RuntimeRecord) => {
    store[options.ssrPerfIdKey] = (store[options.ssrPerfIdKey] || 0) + 1;
    return store[options.ssrPerfIdKey];
  };

  const ssrPush = (store: RuntimeRecord, entry: RuntimeRecord) => {
    const id = nextSsrId(store);
    store[options.ssrPerfStoreKey].push({ id, ...entry });
    return store[options.ssrPerfStoreKey].length - 1;
  };

  const commitSsr = (store: RuntimeRecord, entry: RuntimeRecord) => {
    store[options.ssrPerfStoreKey] = store[options.ssrPerfStoreKey] || [];
    store[options.ssrPerfIndexKey] = store[options.ssrPerfIndexKey] || {};
    store[options.ssrPerfCountKey] = store[options.ssrPerfCountKey] || {};

    const key = (entry && (entry.viteId || entry.component)) || 'unknown';
    const nextCount = (store[options.ssrPerfCountKey][key] || 0) + 1;
    store[options.ssrPerfCountKey][key] = nextCount;

    const next = { ...entry, ssrCount: nextCount };
    const existingIdx = store[options.ssrPerfIndexKey][key];

    if (typeof existingIdx === 'number') {
      const prev = store[options.ssrPerfStoreKey][existingIdx];
      store[options.ssrPerfStoreKey][existingIdx] = { id: prev?.id, ...next };
    } else {
      store[options.ssrPerfIndexKey][key] = ssrPush(store, next);
    }
  };

  const emitRender = (entry: RuntimeRecord) => {
    const renderEvent = {
      component: (entry && entry.component) || 'unknown',
      phase: options.csrPhase,
      duration: (entry && entry.duration) || 0,
      timestamp: Date.now(),
    };
    const hook = getOrCreateRoot()?.[options.hookKey];
    if (hook && hook._emitRender) {
      hook._emitRender(renderEvent);
    }
    window.postMessage(
      { source: options.pageMessageSource, type: options.renderEventType, event: renderEvent },
      '*'
    );
  };

  const commitCsr = (entry: RuntimeRecord) => {
    initCsr();
    const perf = getOrCreateRoot()![options.perfStoreKey];
    const next = { id: nextId(perf), ...entry };

    if (entry && entry.viteId) {
      const idx = perf._csrByViteId[entry.viteId];
      if (typeof idx === 'number') {
        perf.csr[idx] = next;
      } else {
        perf._csrByViteId[entry.viteId] = perf.csr.length;
        perf.csr.push(next);
      }
    } else {
      perf.csr.push(next);
    }

    emitRender(entry);
  };

  const commitComponentQrl = (entry: RuntimeRecord) => {
    const next = { ...entry, phase: options.ssrPhase };
    if (isServer()) {
      commitSsr(getSsrStore(), next);
      return;
    }

    initCsr();
    const perf = getOrCreateRoot()![options.perfStoreKey];
    perf.ssr = perf.ssr || [];
    if (!perf._ssrIndexBuilt) {
      for (let i = 0; i < perf.ssr.length; i++) {
        const e = perf.ssr[i];
        if (e && e.component && typeof perf._ssrByComponent[e.component] !== 'number') {
          perf._ssrByComponent[e.component] = i;
        }
      }
      perf._ssrIndexBuilt = true;
    }

    const key = next && next.component;
    const idx = key ? perf._ssrByComponent[key] : undefined;
    if (typeof idx === 'number') {
      const prev = perf.ssr[idx];
      const prevCount = prev && typeof prev.ssrCount === 'number' ? prev.ssrCount : 0;
      const ssrCount = prevCount + 1;
      perf.ssr[idx] = { id: prev && prev.id, ...next, ssrCount };
    } else {
      const id = nextId(perf);
      if (key) {
        perf._ssrByComponent[key] = perf.ssr.length;
      }
      perf.ssr.push({ id, ...next, ssrCount: 1 });
    }

    emitRender(entry);
  };

  const commit = (entry: RuntimeRecord) => {
    if (isServer()) {
      commitSsr(getSsrStore(), entry);
    } else {
      commitCsr(entry);
    }
  };

  return {
    commit,
    commitComponentQrl,
    isServer,
    perfStoreExpression: options.perfStoreExpression,
  };
}

export interface VNodeRuntimeOptions {
  chunkKey: string;
  componentTreeUpdateType: string;
  devtoolsGlobalKey: string;
  hookKey: string;
  pageMessageSource: string;
  qColon: string;
  qId: string;
  qKey: string;
  qProps: string;
  qRenderFn: string;
  qType: string;
  symbolKey: string;
  untrackedValueKey: string;
}

export interface VNodeRuntimeInternals {
  _getDomContainer: (element: Element) => any;
  _vnode_getAttrKeys: (container: any, vnode: any) => string[];
  _vnode_getFirstChild: (vnode: any) => any;
  _vnode_isMaterialized: (vnode: any) => boolean;
  _vnode_isVirtualVNode: (vnode: any) => boolean;
}

export function __qwik_install_vnode_runtime__(
  options: VNodeRuntimeOptions,
  internals: VNodeRuntimeInternals
) {
  const QRENDERFN = options.qRenderFn;
  const QPROPS = options.qProps;
  const QTYPE = options.qType;
  const QID = options.qId;
  const QKEY = options.qKey;
  const QCOLON = options.qColon;
  const CHUNK_KEY = options.chunkKey;
  const SYMBOL_KEY = options.symbolKey;
  const UNTRACKED_VALUE_KEY = options.untrackedValueKey;
  let idx = 0;
  let vnodeMap: RuntimeRecord = {};

  function serializeProps(val: any, depth: number): any {
    if (depth > 4) {
      return '[depth]';
    }
    if (val === null || val === undefined) {
      return val;
    }
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      return val;
    }
    if (t === 'function') {
      return '[Function]';
    }
    try {
      if (Array.isArray(val)) {
        return val.map((item) => serializeProps(item, depth + 1));
      }
      if (t === 'object') {
        if (CHUNK_KEY in val || SYMBOL_KEY in val) {
          return '[QRL]';
        }
        if (UNTRACKED_VALUE_KEY in val) {
          return serializeProps(val[UNTRACKED_VALUE_KEY], depth + 1);
        }
        const result: RuntimeRecord = {};
        const keys = Object.keys(val);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (key.startsWith('$') && key.endsWith('$')) {
            continue;
          }
          try {
            result[key] = serializeProps(val[key], depth + 1);
          } catch (_) {
            result[key] = '[error]';
          }
        }
        return result;
      }
    } catch (_) {
      // Fall through to string serialization when prop serialization is unsafe.
    }
    return String(val);
  }

  function normalizeName(str: string) {
    const parts = str.split('_');
    const name = parts[0] || '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  function buildTree(container: RuntimeRecord, vnode: RuntimeRecord | null): RuntimeRecord[] {
    if (!vnode) {
      return [];
    }
    const result: RuntimeRecord[] = [];
    let current = vnode;

    while (current) {
      const isVirtual = internals._vnode_isVirtualVNode(current);
      const renderFn = isVirtual ? container.getHostProp(current, QRENDERFN) : null;
      const isComponent = isVirtual && typeof renderFn === 'function';

      if (isComponent) {
        let name = 'Component';
        let qId = '';
        let colonId = '';
        try {
          const keys = internals._vnode_getAttrKeys(container, current);
          for (let i = 0; i < keys.length; i++) {
            if (keys[i] === QTYPE) {
              continue;
            }
            if (keys[i] === QID) {
              qId = String(container.getHostProp(current, QID) || '');
            }
            if (keys[i] === QCOLON) {
              colonId = String(container.getHostProp(current, QCOLON) || '');
            }
          }
          if (renderFn.getSymbol) {
            name = normalizeName(renderFn.getSymbol());
          } else if (renderFn[SYMBOL_KEY]) {
            name = normalizeName(renderFn[SYMBOL_KEY]);
          }
        } catch (_) {
          // Keep the generic component name when vnode metadata is unreadable.
        }

        let qrlChunk = '';
        let qrlPath = '';
        try {
          const chunk = renderFn[CHUNK_KEY] || '';
          const splitPoint = '_component';
          const chunkIdx = chunk.indexOf(splitPoint);
          qrlChunk = chunkIdx > 0 ? chunk.substring(0, chunkIdx) : chunk;
          qrlPath = renderFn.dev && renderFn.dev.file ? renderFn.dev.file : qrlChunk;
        } catch (_) {
          // Leave QRL metadata empty when it cannot be read from the render function.
        }

        let children: RuntimeRecord[] = [];
        const firstChild = internals._vnode_getFirstChild(current);
        if (firstChild) {
          children = buildTree(container, firstChild);
        }

        const nodeProps: RuntimeRecord = qId ? { [QID]: qId } : {};
        if (colonId) {
          nodeProps.__colonId = colonId;
        }
        if (qrlChunk) {
          nodeProps.__qrlChunk = qrlChunk;
        }
        if (qrlPath) {
          nodeProps.__qrlPath = qrlPath;
        }

        const nodeId = qId ? 'q-' + qId : 'vnode-' + idx++;
        vnodeMap[nodeId] = { vnode: current, container };

        result.push({
          name,
          id: nodeId,
          label: name,
          props: nodeProps,
          children: children.length > 0 ? children : undefined,
        });
      } else if (internals._vnode_isMaterialized(current) || (isVirtual && !isComponent)) {
        const fc = internals._vnode_getFirstChild(current);
        if (fc) {
          const nested = buildTree(container, fc);
          for (let j = 0; j < nested.length; j++) {
            result.push(nested[j]);
          }
        }
      }

      current = current.nextSibling || null;
    }

    return result;
  }

  function filterDevtools(nodes: RuntimeRecord[]): RuntimeRecord[] {
    const result: RuntimeRecord[] = [];
    for (let i = 0; i < nodes.length; i++) {
      let n = nodes[i];
      if (n.name === 'Qwikdevtools' || n.name === 'Devtoolscontainer') {
        continue;
      }
      if (n.children) {
        n = {
          name: n.name,
          id: n.id,
          label: n.label,
          props: n.props,
          children: filterDevtools(n.children),
        };
        if (n.children.length === 0) {
          delete n.children;
        }
      }
      result.push(n);
    }
    return result;
  }

  function getTree() {
    try {
      idx = 0;
      vnodeMap = {};
      const container = internals._getDomContainer(document.documentElement);
      if (!container || !container.rootVNode) {
        return null;
      }
      const tree = buildTree(container, container.rootVNode);
      return filterDevtools(tree);
    } catch (_) {
      return null;
    }
  }

  function setupBridge() {
    if (typeof window === 'undefined') {
      return;
    }
    const hook = (window as any)[options.devtoolsGlobalKey]?.[options.hookKey];
    if (!hook) {
      return;
    }

    hook.getVNodeTree = getTree;

    hook.resolveElementToComponent = function (el: Element | null) {
      if (!el) {
        return null;
      }
      let cur: any = el;
      while (cur) {
        const inspector = cur.getAttribute ? cur.getAttribute('data-qwik-inspector') : null;
        if (inspector) {
          const parts = inspector.split('/');
          const fileName = (parts[parts.length - 1] || '').split(':')[0];
          const compName = fileName.replace(/[.](tsx|ts|jsx|js)$/, '');
          if (compName) {
            for (const id in vnodeMap) {
              const entry = vnodeMap[id];
              try {
                const renderFn = entry.container.getHostProp(entry.vnode, QRENDERFN);
                if (typeof renderFn === 'function') {
                  const sym = renderFn.getSymbol
                    ? renderFn.getSymbol()
                    : renderFn[SYMBOL_KEY] || '';
                  const nodeName = normalizeName(sym);
                  if (nodeName.toLowerCase() === compName.toLowerCase()) {
                    return id;
                  }
                }
              } catch (_) {
                // Continue searching if one vnode entry cannot expose its render function.
              }
            }
          }
        }
        cur = cur.parentElement;
      }
      return null;
    };

    function findDomElement(vnode: RuntimeRecord | null): Element | null {
      if (!vnode) {
        return null;
      }
      if (!internals._vnode_isVirtualVNode(vnode) || vnode.node) {
        return vnode.node || null;
      }
      let child = internals._vnode_getFirstChild(vnode);
      while (child) {
        const el = findDomElement(child);
        if (el) {
          return el;
        }
        child = child.nextSibling || null;
      }
      return null;
    }

    hook.getElementRect = function (nodeId: string) {
      const entry = vnodeMap[nodeId];
      if (!entry) {
        return null;
      }
      try {
        const el = findDomElement(entry.vnode);
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      } catch (_) {
        return null;
      }
    };

    hook.highlightNode = function (nodeId: string, name: string | undefined) {
      const entry = vnodeMap[nodeId];
      if (!entry) {
        return false;
      }
      try {
        const el = findDomElement(entry.vnode);
        if (!el) {
          return false;
        }
        let ov = document.getElementById('__qwik_dt_hover_ov');
        if (!ov) {
          ov = document.createElement('div');
          ov.id = '__qwik_dt_hover_ov';
          ov.style.cssText =
            'position:fixed;pointer-events:none;border:2px solid #8b5cf6;background:rgba(139,92,246,0.08);z-index:2147483646;border-radius:4px;transition:all 0.15s ease';
          const lbl = document.createElement('div');
          lbl.id = '__qwik_dt_hover_lbl';
          lbl.style.cssText =
            'position:absolute;top:-20px;left:-2px;background:#8b5cf6;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px 3px 0 0;white-space:nowrap;font-family:system-ui,sans-serif';
          ov.appendChild(lbl);
          document.body.appendChild(ov);
        }
        const r = el.getBoundingClientRect();
        ov.style.display = 'block';
        ov.style.top = r.top + 'px';
        ov.style.left = r.left + 'px';
        ov.style.width = r.width + 'px';
        ov.style.height = r.height + 'px';
        const lbl2 = document.getElementById('__qwik_dt_hover_lbl');
        if (lbl2) {
          lbl2.textContent = '<' + (name || 'Component') + ' />';
        }
        return true;
      } catch (_) {
        return false;
      }
    };

    hook.unhighlightNode = function () {
      const ov = document.getElementById('__qwik_dt_hover_ov');
      if (ov) {
        ov.style.display = 'none';
      }
    };

    hook.getNodeProps = function (nodeId: string) {
      const entry = vnodeMap[nodeId];
      if (!entry) {
        return null;
      }
      try {
        const props = entry.container.getHostProp(entry.vnode, QPROPS);
        if (!props) {
          return null;
        }
        const result: RuntimeRecord = {};
        const keys = Object.keys(props);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (key.startsWith('on:') || key.startsWith('on$:')) {
            continue;
          }
          try {
            result[key] = serializeProps(props[key], 0);
          } catch (_) {
            result[key] = '[error]';
          }
        }
        return result;
      } catch (_) {
        return null;
      }
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 100;

    function pushTree() {
      const tree = getTree();
      if (!tree) {
        return;
      }
      window.postMessage(
        {
          source: options.pageMessageSource,
          type: options.componentTreeUpdateType,
          tree,
        },
        '*'
      );
    }

    const observer = new MutationObserver(function () {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(pushTree, DEBOUNCE_MS);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [QID, QKEY, QCOLON],
    });

    pushTree();
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupBridge);
    } else {
      setupBridge();
    }
  }
}
