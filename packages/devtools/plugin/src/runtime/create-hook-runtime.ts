import { QWIK_DEVTOOLS_GLOBAL, SIGNAL_HOOK_TYPES } from '@qwik.dev/devtools/kit';
import {
  createRuntimeCall,
  createRuntimeInstallerSource,
  createRuntimeModule,
} from './create-runtime-module';
import { __qwik_install_hook_runtime__ } from './installers';

export function createHookRuntime(): string {
  return createRuntimeModule([
    '// [qwik-devtools-hook] runtime (injected by @devtools/plugin)',
    createRuntimeInstallerSource(__qwik_install_hook_runtime__),
    createRuntimeCall('__qwik_install_hook_runtime__', [
      {
        componentStateKey: QWIK_DEVTOOLS_GLOBAL.props.componentState,
        devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
        globalVersion: QWIK_DEVTOOLS_GLOBAL.version,
        hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
        signalHookTypes: SIGNAL_HOOK_TYPES,
      },
    ]),
  ]);
}
