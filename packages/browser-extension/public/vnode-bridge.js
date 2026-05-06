/**
 * VNode bridge - injected by the browser extension as an ES module. Bridges Qwik VNode internals to
 * the devtools hook.
 *
 * NOTE: This duplicates logic from plugin/virtualmodules/vnodeBridge.ts and the EVAL_INSTALL_BRIDGE
 * in extension-data-provider.ts. All three must stay in sync. The duplication exists because each
 * runs in a different context (Vite SSR, ES module, inspectedWindow.eval).
 *
 * Requires @qwik.dev/core/internal to be resolvable (works in dev mode where Vite serves bare
 * module imports).
 *
 * Skips silently if the Vite plugin already set up the bridge (checks hook.getVNodeTree existence).
 */
import {
  _getDomContainer,
  _vnode_getFirstChild,
  _vnode_isVirtualVNode,
  _vnode_isMaterialized,
  _vnode_getAttrKeys,
} from '@qwik.dev/core/internal';

var QRENDERFN = 'q:renderFn';
var QPROPS = 'q:props';
var QTYPE = 'q:type';
var _idx = 0;
var _vnodeMap = {};

function serializeProps(val, depth) {
  if (depth > 4) return '[depth]';
  if (val === null || val === undefined) return val;
  var t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') return val;
  if (t === 'function') return '[Function]';
  try {
    if (Array.isArray(val)) {
      return val.map(function (item) {
        return serializeProps(item, depth + 1);
      });
    }
    if (t === 'object') {
      if ('$chunk$' in val || '$symbol$' in val) return '[QRL]';
      if ('$untrackedValue$' in val) return serializeProps(val.$untrackedValue$, depth + 1);
      var result = {};
      var keys = Object.keys(val);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.startsWith('$') && key.endsWith('$')) continue;
        try {
          result[key] = serializeProps(val[key], depth + 1);
        } catch (_) {
          result[key] = '[error]';
        }
      }
      return result;
    }
  } catch (_) {}
  return String(val);
}

function normalizeName(str) {
  var parts = str.split('_');
  var name = parts[0] || '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function buildTree(container, vnode) {
  if (!vnode) return [];
  var result = [];
  var current = vnode;
  while (current) {
    var isVirtual = _vnode_isVirtualVNode(current);
    var renderFn = isVirtual ? container.getHostProp(current, QRENDERFN) : null;
    var isComponent = isVirtual && typeof renderFn === 'function';
    if (isComponent) {
      var name = 'Component';
      var qId = '';
      var colonId = '';
      try {
        var keys = _vnode_getAttrKeys(container, current);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i] === QTYPE) continue;
          if (keys[i] === 'q:id') qId = String(container.getHostProp(current, 'q:id') || '');
          if (keys[i] === ':') colonId = String(container.getHostProp(current, ':') || '');
        }
        if (renderFn.getSymbol) name = normalizeName(renderFn.getSymbol());
        else if (renderFn.$symbol$) name = normalizeName(renderFn.$symbol$);
      } catch (_) {}
      var qrlChunk = '';
      var qrlPath = '';
      try {
        var chunk = renderFn.$chunk$ || '';
        var splitPoint = '_component';
        var idx = chunk.indexOf(splitPoint);
        qrlChunk = idx > 0 ? chunk.substring(0, idx) : chunk;
        qrlPath = renderFn.dev && renderFn.dev.file ? renderFn.dev.file : qrlChunk;
      } catch (_) {}
      var children = [];
      var firstChild = _vnode_getFirstChild(current);
      if (firstChild) children = buildTree(container, firstChild);
      var nodeProps = qId ? { 'q:id': qId } : {};
      if (colonId) nodeProps.__colonId = colonId;
      if (qrlChunk) nodeProps.__qrlChunk = qrlChunk;
      if (qrlPath) nodeProps.__qrlPath = qrlPath;
      var nodeId = qId ? 'q-' + qId : 'vnode-' + _idx++;
      _vnodeMap[nodeId] = { vnode: current, container: container };
      result.push({
        name: name,
        id: nodeId,
        label: name,
        props: nodeProps,
        children: children.length > 0 ? children : undefined,
      });
    } else if (_vnode_isMaterialized(current) || (isVirtual && !isComponent)) {
      var fc = _vnode_getFirstChild(current);
      if (fc) {
        var nested = buildTree(container, fc);
        for (var j = 0; j < nested.length; j++) result.push(nested[j]);
      }
    }
    current = current.nextSibling || null;
  }
  return result;
}

function getTree() {
  try {
    _idx = 0;
    _vnodeMap = {};
    var container = _getDomContainer(document.documentElement);
    if (!container || !container.rootVNode) return null;
    var tree = buildTree(container, container.rootVNode);
    return filterDevtools(tree);
  } catch (e) {
    return null;
  }
}

function filterDevtools(nodes) {
  var result = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.name === 'Qwikdevtools' || n.name === 'Devtoolscontainer') continue;
    if (n.children) {
      n = {
        name: n.name,
        id: n.id,
        label: n.label,
        props: n.props,
        children: filterDevtools(n.children),
      };
      if (n.children.length === 0) delete n.children;
    }
    result.push(n);
  }
  return result;
}

function setupBridge() {
  if (typeof window === 'undefined') return;
  var hook = window.__QWIK_DEVTOOLS_HOOK__;
  if (!hook) return;
  // Skip if Vite plugin already set up the bridge
  if (typeof hook.getVNodeTree === 'function') return;

  hook.getVNodeTree = getTree;

  hook.resolveElementToComponent = function (el) {
    if (!el) return null;
    var cur = el;
    while (cur) {
      var inspector = cur.getAttribute ? cur.getAttribute('data-qwik-inspector') : null;
      if (inspector) {
        var parts = inspector.split('/');
        var fileName = (parts[parts.length - 1] || '').split(':')[0];
        var compName = fileName.replace(/\.(tsx|ts|jsx|js)$/, '');
        if (compName) {
          for (var id in _vnodeMap) {
            var entry = _vnodeMap[id];
            try {
              var renderFn = entry.container.getHostProp(entry.vnode, QRENDERFN);
              if (typeof renderFn === 'function') {
                var sym = renderFn.getSymbol ? renderFn.getSymbol() : renderFn.$symbol$ || '';
                var nodeName = normalizeName(sym);
                if (nodeName.toLowerCase() === compName.toLowerCase()) return id;
              }
            } catch (_) {}
          }
        }
      }
      cur = cur.parentElement;
    }
    return null;
  };

  function findDomElement(vnode) {
    if (!vnode) return null;
    if (!_vnode_isVirtualVNode(vnode) || vnode.node) return vnode.node || null;
    var child = _vnode_getFirstChild(vnode);
    while (child) {
      var el = findDomElement(child);
      if (el) return el;
      child = child.nextSibling || null;
    }
    return null;
  }

  hook.getElementRect = function (nodeId) {
    var entry = _vnodeMap[nodeId];
    if (!entry) return null;
    try {
      var el = findDomElement(entry.vnode);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    } catch (_) {
      return null;
    }
  };

  hook.highlightNode = function (nodeId, name) {
    var entry = _vnodeMap[nodeId];
    if (!entry) return false;
    try {
      var el = findDomElement(entry.vnode);
      if (!el) return false;
      var ov = document.getElementById('__qwik_dt_hover_ov');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = '__qwik_dt_hover_ov';
        ov.style.cssText =
          'position:fixed;pointer-events:none;border:2px solid #8b5cf6;background:rgba(139,92,246,0.08);z-index:2147483646;border-radius:4px;transition:all 0.15s ease';
        var lbl = document.createElement('div');
        lbl.id = '__qwik_dt_hover_lbl';
        lbl.style.cssText =
          'position:absolute;top:-20px;left:-2px;background:#8b5cf6;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px 3px 0 0;white-space:nowrap;font-family:system-ui,sans-serif';
        ov.appendChild(lbl);
        document.body.appendChild(ov);
      }
      var r = el.getBoundingClientRect();
      ov.style.display = 'block';
      ov.style.top = r.top + 'px';
      ov.style.left = r.left + 'px';
      ov.style.width = r.width + 'px';
      ov.style.height = r.height + 'px';
      var lbl2 = document.getElementById('__qwik_dt_hover_lbl');
      if (lbl2) lbl2.textContent = '<' + (name || 'Component') + ' />';
      return true;
    } catch (_) {
      return false;
    }
  };

  hook.unhighlightNode = function () {
    var ov = document.getElementById('__qwik_dt_hover_ov');
    if (ov) ov.style.display = 'none';
  };

  hook.getNodeProps = function (nodeId) {
    var entry = _vnodeMap[nodeId];
    if (!entry) return null;
    try {
      var props = entry.container.getHostProp(entry.vnode, QPROPS);
      if (!props) return null;
      var result = {};
      var keys = Object.keys(props);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.startsWith('on:') || key.startsWith('on$:')) continue;
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

  // Real-time tree push via MutationObserver
  var debounceTimer = null;
  function pushTree() {
    var tree = getTree();
    if (!tree) return;
    window.postMessage({ source: 'qwik-devtools', type: 'COMPONENT_TREE_UPDATE', tree: tree }, '*');
  }
  var observer = new MutationObserver(function () {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(pushTree, 100);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['q:id', 'q:key', ':'],
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
