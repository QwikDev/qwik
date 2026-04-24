/**
 * Devtools hook runtime - injected by the browser extension into the main world. Sets up
 * window.**QWIK_DEVTOOLS_HOOK** with signal tracking, component snapshots, and state editing. Skips
 * if the Vite plugin already installed the hook.
 *
 * NOTE: This duplicates logic from plugin/virtualmodules/hookRuntime.ts. Both must stay in sync.
 * The duplication is intentional: the plugin injects via SSR middleware, while the extension
 * injects via content script.
 *
 * This is a plain script (no ES module imports needed).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__QWIK_DEVTOOLS_HOOK__) return;

  var renderListeners = [];

  var signalTypes = {
    useSignal: true,
    useStore: true,
    useComputed: true,
    useAsyncComputed: true,
    useContext: true,
  };

  function safeSerialize(val) {
    if (val === null || val === undefined) return val;
    var t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return val;
    if (t === 'function') return '[Function]';
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_) {
      return '[' + t + ']';
    }
  }

  function deepSerialize(val, depth) {
    if (depth > 6) return '[depth limit]';
    if (val === null) return null;
    if (val === undefined) return undefined;
    var t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return val;
    if (t === 'function') return { __type: 'function', __name: val.name || 'anonymous' };
    try {
      if (val && t === 'object' && '$untrackedValue$' in val) {
        return deepSerialize(val.$untrackedValue$, depth + 1);
      }
      if (Array.isArray(val)) {
        return val.map(function (item) {
          return deepSerialize(item, depth + 1);
        });
      }
      if (t === 'object') {
        var className = val.constructor ? val.constructor.name : 'Object';
        var result = {};
        if (className !== 'Object') {
          result.__className = className;
          try {
            if (typeof val.toString === 'function' && val.toString !== Object.prototype.toString) {
              result.__display = val.toString();
            }
          } catch (_) {}
        }
        var keys = Object.keys(val);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (key.charAt(0) === '$' && key.charAt(key.length - 1) === '$') continue;
          try {
            result[key] = deepSerialize(val[key], depth + 1);
          } catch (_) {
            result[key] = '[unreadable]';
          }
        }
        return result;
      }
    } catch (_) {}
    return String(val);
  }

  function readValue(ref) {
    try {
      if (ref && typeof ref === 'object' && 'value' in ref) return safeSerialize(ref.value);
      if (ref && typeof ref === 'object') return safeSerialize(ref);
      return undefined;
    } catch (_) {
      return '[error]';
    }
  }

  function findComponentKey(componentName, qrlChunk) {
    var state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
    if (!state) return null;
    var keys = Object.keys(state);
    if (qrlChunk) {
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].endsWith(qrlChunk)) return keys[i];
      }
    }
    var lowerName = componentName.toLowerCase();
    for (var j = 0; j < keys.length; j++) {
      var lastSeg = keys[j].split('/').pop() || keys[j];
      var underIdx = lastSeg.lastIndexOf('_');
      var name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;
      if (name.toLowerCase() === lowerName) return keys[j];
    }
    return null;
  }

  window.__QWIK_DEVTOOLS_HOOK__ = {
    version: 1,

    _emitRender: function (info) {
      for (var i = 0; i < renderListeners.length; i++) {
        try {
          renderListeners[i](info);
        } catch (_) {}
      }
    },

    getSignalValue: function (signal) {
      if (signal && typeof signal === 'object' && 'value' in signal) return signal.value;
      return undefined;
    },

    getSignalsSnapshot: function () {
      var state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      if (!state) return {};
      var snapshot = {};
      var paths = Object.keys(state);
      for (var p = 0; p < paths.length; p++) {
        var hooks = state[paths[p]].hooks || [];
        var signals = [];
        for (var h = 0; h < hooks.length; h++) {
          if (signalTypes[hooks[h].hookType] && hooks[h].data != null) {
            signals.push({
              name: hooks[h].variableName || '',
              hookType: hooks[h].hookType,
              value: readValue(hooks[h].data),
            });
          }
        }
        if (signals.length > 0) snapshot[paths[p]] = signals;
      }
      return snapshot;
    },

    getComponentTreeSnapshot: function () {
      var state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      if (!state) return [];
      return Object.keys(state).map(function (path) {
        var comp = state[path];
        var hooks = comp.hooks || [];
        var lastSeg = path.split('/').pop() || path;
        var underIdx = lastSeg.lastIndexOf('_');
        var name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;
        var signals = [];
        var hookEntries = [];
        for (var i = 0; i < hooks.length; i++) {
          hookEntries.push({
            variableName: hooks[i].variableName || '',
            hookType: hooks[i].hookType || '',
            category: hooks[i].category || '',
          });
          if (signalTypes[hooks[i].hookType] && hooks[i].data != null) {
            signals.push({
              name: hooks[i].variableName || '',
              hookType: hooks[i].hookType,
              value: readValue(hooks[i].data),
            });
          }
        }
        return { path: path, name: name, signals: signals, hooks: hookEntries };
      });
    },

    onRender: function (callback) {
      renderListeners.push(callback);
      return function () {
        var idx = renderListeners.indexOf(callback);
        if (idx >= 0) renderListeners.splice(idx, 1);
      };
    },

    getComponentDetail: function (componentName, qrlChunk) {
      var key = findComponentKey(componentName, qrlChunk);
      if (!key) return null;
      var state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      var comp = state[key];
      if (!comp || !comp.hooks) return null;
      var result = [];
      for (var i = 0; i < comp.hooks.length; i++) {
        var h = comp.hooks[i];
        if (h.data != null) {
          result.push({
            hookType: h.hookType || 'unknown',
            variableName: h.variableName || h.hookType || 'unknown',
            data: deepSerialize(h.data, 0),
          });
        }
      }
      return result;
    },

    setSignalValue: function (componentName, qrlChunk, variableName, newValue) {
      var key = findComponentKey(componentName, qrlChunk);
      if (!key) return false;
      var state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      var comp = state[key];
      if (!comp || !comp.hooks) return false;
      for (var i = 0; i < comp.hooks.length; i++) {
        var h = comp.hooks[i];
        if (h.variableName === variableName && h.data != null) {
          try {
            if (typeof h.data === 'object' && 'value' in h.data) {
              h.data.value = newValue;
              return true;
            }
          } catch (_) {}
        }
      }
      return false;
    },

    onSignalUpdate: function () {
      return function () {};
    },
  };
})();
