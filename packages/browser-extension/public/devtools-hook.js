/**
 * Devtools hook runtime - injected by the browser extension into the main world.
 * Sets up window.__QWIK_DEVTOOLS__.hook with signal tracking, component snapshots,
 * and state editing. Skips if the Vite plugin already installed the hook.
 *
 * GENERATED FILE - DO NOT EDIT BY HAND.
 * Source of truth: packages/devtools/plugin/src/runtime/installers.ts
 *   (__qwik_install_hook_runtime__)
 * Regenerate: pnpm --filter @devtools/browser-extension generate
 */
(function () {
	'use strict';
	function __qwik_install_hook_runtime__(options) {
		const renderListeners = [];
		const signalTypes = {};
		for (let i = 0; i < options.signalHookTypes.length; i++) signalTypes[options.signalHookTypes[i]] = true;
		const safeSerialize = (val) => {
			if (val === null || val === void 0) return val;
			const t = typeof val;
			if (t === "string" || t === "number" || t === "boolean") return val;
			if (t === "function") return "[Function]";
			try {
				return JSON.parse(JSON.stringify(val));
			} catch (_) {
				return "[" + t + "]";
			}
		};
		const serializeDeep = (val, depth) => {
			if (depth > 6) return "[depth limit]";
			if (val === null) return null;
			if (val === void 0) return;
			const t = typeof val;
			if (t === "string" || t === "number" || t === "boolean") return val;
			if (t === "function") return {
				__type: "function",
				__name: val.name || "anonymous"
			};
			try {
				if (val && t === "object" && "$untrackedValue$" in val) return serializeDeep(val.$untrackedValue$, depth + 1);
				if (Array.isArray(val)) return val.map((item) => serializeDeep(item, depth + 1));
				if (t === "object") {
					const className = val.constructor ? val.constructor.name : "Object";
					const result = {};
					if (className !== "Object") {
						result.__className = className;
						try {
							if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) result.__display = val.toString();
						} catch (_) {}
					}
					const keys = Object.keys(val);
					for (let i = 0; i < keys.length; i++) {
						const key = keys[i];
						if (key.startsWith("$") && key.endsWith("$")) continue;
						try {
							result[key] = serializeDeep(val[key], depth + 1);
						} catch (_) {
							result[key] = "[unreadable]";
						}
					}
					return result;
				}
			} catch (_) {}
			return String(val);
		};
		const readValue = (ref) => {
			try {
				if (ref && typeof ref === "object" && "value" in ref) return safeSerialize(ref.value);
				if (ref && typeof ref === "object") return safeSerialize(ref);
				return;
			} catch (_) {
				return "[error]";
			}
		};
		const getOrCreateRoot = () => {
			if (typeof window === "undefined") return;
			const win = window;
			const root = win[options.devtoolsGlobalKey] || (win[options.devtoolsGlobalKey] = { version: options.globalVersion });
			root.version = root.version || options.globalVersion;
			root[options.componentStateKey] = root[options.componentStateKey] || {};
			return root;
		};
		const getState = () => {
			return getOrCreateRoot()?.[options.componentStateKey];
		};
		const findComponentKey = (componentName, qrlChunk) => {
			const state = getState();
			if (!state) return null;
			const keys = Object.keys(state);
			if (qrlChunk) {
				const byChunk = keys.find((key) => key.endsWith(qrlChunk));
				if (byChunk) return byChunk;
			}
			const lowerName = componentName.toLowerCase();
			for (const key of keys) {
				const lastSeg = key.split("/").pop() || key;
				const underIdx = lastSeg.lastIndexOf("_");
				if ((underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg).toLowerCase() === lowerName) return key;
			}
			return null;
		};
		const methods = {
			_emitRender(info) {
				for (let i = 0; i < renderListeners.length; i++) try {
					renderListeners[i](info);
				} catch (_) {}
			},
			getSignalValue(signal) {
				if (signal && typeof signal === "object" && "value" in signal) return signal.value;
			},
			getSignalsSnapshot() {
				const state = getState();
				if (!state) return {};
				const snapshot = {};
				for (const path of Object.keys(state)) {
					const hooks = state[path].hooks || [];
					const signals = [];
					for (const h of hooks) if (signalTypes[h.hookType] && h.data != null) signals.push({
						name: h.variableName || "",
						hookType: h.hookType,
						value: readValue(h.data)
					});
					if (signals.length > 0) snapshot[path] = signals;
				}
				return snapshot;
			},
			getComponentTreeSnapshot() {
				const state = getState();
				if (!state) return [];
				return Object.keys(state).map((path) => {
					const hooks = state[path].hooks || [];
					const lastSeg = path.split("/").pop() || path;
					const underIdx = lastSeg.lastIndexOf("_");
					const name = underIdx > 0 ? lastSeg.substring(underIdx + 1) : lastSeg;
					const signals = [];
					const hookEntries = [];
					for (const h of hooks) {
						hookEntries.push({
							variableName: h.variableName || "",
							hookType: h.hookType || "",
							category: h.category || ""
						});
						if (signalTypes[h.hookType] && h.data != null) signals.push({
							name: h.variableName || "",
							hookType: h.hookType,
							value: readValue(h.data)
						});
					}
					return {
						path,
						name,
						signals,
						hooks: hookEntries
					};
				});
			},
			onRender(callback) {
				renderListeners.push(callback);
				return () => {
					const idx = renderListeners.indexOf(callback);
					if (idx >= 0) renderListeners.splice(idx, 1);
				};
			},
			getComponentDetail(componentName, qrlChunk) {
				const state = getState();
				const matchingKey = findComponentKey(componentName, qrlChunk);
				if (!state || !matchingKey) return null;
				const comp = state[matchingKey];
				if (!comp || !comp.hooks) return null;
				return comp.hooks.filter((h) => h.data != null).map((h) => ({
					hookType: h.hookType || "unknown",
					variableName: h.variableName || h.hookType || "unknown",
					data: serializeDeep(h.data, 0)
				}));
			},
			setSignalValue(componentName, qrlChunk, variableName, newValue) {
				const state = getState();
				const matchingKey = findComponentKey(componentName, qrlChunk);
				if (!state || !matchingKey) return false;
				const comp = state[matchingKey];
				if (!comp || !comp.hooks) return false;
				for (const h of comp.hooks) if (h.variableName === variableName && h.data != null) try {
					if (typeof h.data === "object" && "value" in h.data) {
						h.data.value = newValue;
						return true;
					}
				} catch (_) {}
				return false;
			},
			onSignalUpdate(_callback) {
				return () => {};
			}
		};
		const root = getOrCreateRoot();
		if (!root || root[options.hookKey]) return;
		root[options.hookKey] = {
			version: 1,
			...methods
		};
	}
	__qwik_install_hook_runtime__({ "componentStateKey": "componentState", "devtoolsGlobalKey": "__QWIK_DEVTOOLS__", "globalVersion": 1, "hookKey": "hook", "signalHookTypes": ["useSignal", "useStore", "useComputed", "useAsyncComputed", "useContext"] });
})();
