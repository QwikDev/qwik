/**
 * Runtime snippet that installs `window.__QWIK_DEVTOOLS_HOOK__`.
 *
 * This file exports a **string** (not executable TS) that gets appended to {@link perfRuntime}.
 * Since perfRuntime is concatenated into plain JS modules (`virtual:qwik-component-proxy`, lazy
 * render wrappers), the hook initialises before any Qwik component renders.
 *
 * Signal values are read directly from `QWIK_DEVTOOLS_GLOBAL_STATE`: each hook entry has `data` set
 * to the actual signal/store reference by the `collecthook()` instrumentation. The hook reads
 * `.value` from those references at snapshot time.
 */
const hookRuntime = `
// [qwik-devtools-hook] runtime (injected by @devtools/plugin)
const __qwik_hook_render_listeners__ = [];

const __qwik_hook_signal_types__ = {
  useSignal: true,
  useStore: true,
  useComputed: true,
  useAsyncComputed: true,
  useContext: true,
};

const __qwik_hook_safe_serialize__ = (val) => {
  if (val === null || val === undefined) return val;
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') return val;
  if (t === 'function') return '[Function]';
  try { return JSON.parse(JSON.stringify(val)); } catch (_) { return '[' + t + ']'; }
};

const __qwik_hook_serialize_deep__ = (val, depth) => {
  if (depth > 6) return '[depth limit]';
  if (val === null) return null;
  if (val === undefined) return undefined;
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') return val;
  if (t === 'function') {
    const n = val.name || 'anonymous';
    return { __type: 'function', __name: n };
  }

  try {
    // Signal: read untracked value to avoid tracking
    if (val && t === 'object' && '$untrackedValue$' in val) {
      return __qwik_hook_serialize_deep__(val.$untrackedValue$, depth + 1);
    }

    if (Array.isArray(val)) {
      return val.map((item) => __qwik_hook_serialize_deep__(item, depth + 1));
    }

    if (t === 'object') {
      const className = val.constructor ? val.constructor.name : 'Object';
      const result = {};

      if (className !== 'Object') {
        result.__className = className;
        // Provide string representation for known types
        try {
          if (typeof val.toString === 'function' && val.toString !== Object.prototype.toString) {
            result.__display = val.toString();
          }
        } catch (_) {}
      }

      const keys = Object.keys(val);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key.startsWith('$') && key.endsWith('$')) continue; // skip Qwik internals
        try {
          result[key] = __qwik_hook_serialize_deep__(val[key], depth + 1);
        } catch (_) {
          result[key] = '[unreadable]';
        }
      }

      return result;
    }
  } catch (_) {}

  return String(val);
};

const __qwik_hook_read_value__ = (ref) => {
  try {
    if (ref && typeof ref === 'object' && 'value' in ref) {
      return __qwik_hook_safe_serialize__(ref.value);
    }
    // useStore returns a proxy directly (no .value wrapper)
    if (ref && typeof ref === 'object') {
      return __qwik_hook_safe_serialize__(ref);
    }
    return undefined;
  } catch (_) {
    return '[error]';
  }
};

const __qwik_hook_init__ = () => {
  if (typeof window === 'undefined' || window.__QWIK_DEVTOOLS_HOOK__) return;

  window.__QWIK_DEVTOOLS_HOOK__ = {
    version: 1,

    _emitRender(info) {
      for (let i = 0; i < __qwik_hook_render_listeners__.length; i++) {
        try { __qwik_hook_render_listeners__[i](info); } catch (_) { /* skip */ }
      }
    },

    getSignalValue(signal) {
      if (signal && typeof signal === 'object' && 'value' in signal) {
        return signal.value;
      }
      return undefined;
    },

    getSignalsSnapshot() {
      const state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      if (!state) return {};
      const snapshot = {};
      for (const path of Object.keys(state)) {
        const hooks = state[path].hooks || [];
        const signals = [];
        for (const h of hooks) {
          if (__qwik_hook_signal_types__[h.hookType] && h.data != null) {
            signals.push({
              name: h.variableName || '',
              hookType: h.hookType,
              value: __qwik_hook_read_value__(h.data),
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
      const state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      if (!state) return [];

      return Object.keys(state).map((path) => {
        const comp = state[path];
        const hooks = comp.hooks || [];
        const lastSeg = path.split('/').pop() || path;
        const underIdx = lastSeg.lastIndexOf('_');
        const name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;

        const signals = [];
        const hookEntries = [];
        for (const h of hooks) {
          hookEntries.push({
            variableName: h.variableName || '',
            hookType: h.hookType || '',
            category: h.category || '',
          });
          if (__qwik_hook_signal_types__[h.hookType] && h.data != null) {
            signals.push({
              name: h.variableName || '',
              hookType: h.hookType,
              value: __qwik_hook_read_value__(h.data),
            });
          }
        }

        return { path, name, signals, hooks: hookEntries };
      });
    },

    onRender(callback) {
      __qwik_hook_render_listeners__.push(callback);
      return () => {
        const idx = __qwik_hook_render_listeners__.indexOf(callback);
        if (idx >= 0) __qwik_hook_render_listeners__.splice(idx, 1);
      };
    },

    getComponentDetail(componentName, qrlChunk) {
      const state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      if (!state) return null;

      let matchingKey = null;
      const keys = Object.keys(state);

      // Strategy 1: match by QRL chunk path (same as overlay's getQwikState)
      if (qrlChunk) {
        matchingKey = keys.find((key) => key.endsWith(qrlChunk)) || null;
      }

      // Strategy 2: match by component name
      if (!matchingKey) {
        const lowerName = componentName.toLowerCase();
        for (const key of keys) {
          const lastSeg = key.split('/').pop() || key;
          const underIdx = lastSeg.lastIndexOf('_');
          const name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;
          if (name.toLowerCase() === lowerName) {
            matchingKey = key;
            break;
          }
        }
      }

      if (!matchingKey) return null;
      const comp = state[matchingKey];
      if (!comp || !comp.hooks) return null;

      return comp.hooks
        .filter((h) => h.data != null)
        .map((h) => ({
          hookType: h.hookType || 'unknown',
          variableName: h.variableName || h.hookType || 'unknown',
          data: __qwik_hook_serialize_deep__(h.data, 0),
        }));
    },

    setSignalValue(componentName, qrlChunk, variableName, newValue) {
      const state = window.QWIK_DEVTOOLS_GLOBAL_STATE;
      if (!state) return false;

      let matchingKey = null;
      const keys = Object.keys(state);

      if (qrlChunk) {
        matchingKey = keys.find((key) => key.endsWith(qrlChunk)) || null;
      }
      if (!matchingKey) {
        const lowerName = componentName.toLowerCase();
        for (const key of keys) {
          const lastSeg = key.split('/').pop() || key;
          const underIdx = lastSeg.lastIndexOf('_');
          const name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;
          if (name.toLowerCase() === lowerName) { matchingKey = key; break; }
        }
      }
      if (!matchingKey) return false;

      const comp = state[matchingKey];
      if (!comp || !comp.hooks) return false;

      for (const h of comp.hooks) {
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

    onSignalUpdate(callback) {
      // Stub: push notifications not yet implemented.
      // Consumers should poll getSignalsSnapshot() and diff.
      return () => {};
    },
  };
};

__qwik_hook_init__();
`;

export default hookRuntime;
