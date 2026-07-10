import { QWIK_DEVTOOLS_GLOBAL, SIGNAL_HOOK_TYPES } from '@qwik.dev/devtools/kit';
import {
  createRuntimeCall,
  createRuntimeInstallerSource,
  createRuntimeModule,
} from './create-runtime-module';
import {
  __qwik_derive_component_name__,
  __qwik_find_component_key__,
  __qwik_install_hook_runtime__,
} from './installers';

// Shared runtime utilities the hook installer references by name. They must be emitted into the
// injected bundle alongside the installer (they are top-level functions, so `toString()` keeps
// their names).
const HOOK_RUNTIME_UTILS = [
  createRuntimeInstallerSource(__qwik_derive_component_name__),
  createRuntimeInstallerSource(__qwik_find_component_key__),
];

const HOOK_RUNTIME_OPTIONS = {
  componentStateKey: QWIK_DEVTOOLS_GLOBAL.props.componentState,
  devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
  globalVersion: QWIK_DEVTOOLS_GLOBAL.version,
  hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
  signalHookTypes: SIGNAL_HOOK_TYPES,
};

export function createHookRuntime(): string {
  return createRuntimeModule([
    '// [qwik-devtools-hook] runtime (injected by @devtools/plugin)',
    ...HOOK_RUNTIME_UTILS,
    createRuntimeInstallerSource(__qwik_install_hook_runtime__),
    createRuntimeCall('__qwik_install_hook_runtime__', [HOOK_RUNTIME_OPTIONS]),
  ]);
}

const EXTENSION_HOOK_BANNER = [
  '/**',
  ' * Devtools hook runtime - injected by the browser extension into the main world.',
  ' * Sets up window.__QWIK_DEVTOOLS__.hook with signal tracking, component snapshots,',
  ' * and state editing. Skips if the Vite plugin already installed the hook.',
  ' *',
  ' * GENERATED FILE - DO NOT EDIT BY HAND.',
  ' * Source of truth: packages/devtools/plugin/src/runtime/installers.ts',
  ' *   (__qwik_install_hook_runtime__)',
  ' * Regenerated automatically by the browser-extension build and dev scripts.',
  ' */',
].join('\n');

// Bundled output is tab-indented; prepend a tab (not spaces) so the wrapped body stays
// uniformly tab-indented rather than mixing tabs and spaces. The emitted file is a
// generated artifact (see .prettierignore).
const indent = (source: string): string =>
  source
    .split('\n')
    .map((line) => (line.length > 0 ? '\t' + line : line))
    .join('\n');

/**
 * Builds the plain-script (IIFE) form of the hook runtime for the browser extension's
 * content-script injection. Reuses the exact same canonical installer as the Vite plugin so both
 * code paths stay byte-for-byte in sync.
 */
export function createExtensionHookRuntime(): string {
  const installerSource = createRuntimeInstallerSource(__qwik_install_hook_runtime__);
  const installerCall = createRuntimeCall('__qwik_install_hook_runtime__', [HOOK_RUNTIME_OPTIONS]);
  const body = [...HOOK_RUNTIME_UTILS, installerSource, installerCall]
    .map((part) => indent(part))
    .join('\n');
  return EXTENSION_HOOK_BANNER + '\n(function () {\n' + "\t'use strict';\n" + body + '\n})();\n';
}
