import {
  DEVTOOLS_MESSAGES,
  QWIK_DEVTOOLS_GLOBAL,
  QWIK_VNODE_PROTOCOL,
} from '@qwik.dev/devtools/kit';
import {
  createRuntimeCall,
  createRuntimeInstallerSource,
  createRuntimeModule,
  createRuntimeVar,
  runtimeExpression,
} from './create-runtime-module';
import { __qwik_install_vnode_runtime__ } from './installers';

export function createVNodeRuntime(): string {
  return createRuntimeModule([
    `
import {
  _getDomContainer,
  _vnode_getFirstChild,
  _vnode_isVirtualVNode,
  _vnode_isMaterialized,
  _vnode_getAttrKeys,
} from '@qwik.dev/core/internal';
`,
    createRuntimeVar('QRENDERFN', QWIK_VNODE_PROTOCOL.attrs.renderFn),
    createRuntimeVar('QPROPS', QWIK_VNODE_PROTOCOL.attrs.props),
    createRuntimeVar('QTYPE', QWIK_VNODE_PROTOCOL.attrs.type),
    createRuntimeVar('QID', QWIK_VNODE_PROTOCOL.attrs.id),
    createRuntimeVar('QKEY', QWIK_VNODE_PROTOCOL.attrs.key),
    createRuntimeVar('QCOLON', QWIK_VNODE_PROTOCOL.attrs.colon),
    createRuntimeVar('CHUNK_KEY', QWIK_VNODE_PROTOCOL.qrl.chunk),
    createRuntimeVar('SYMBOL_KEY', QWIK_VNODE_PROTOCOL.qrl.symbol),
    createRuntimeVar('UNTRACKED_VALUE_KEY', QWIK_VNODE_PROTOCOL.qrl.untrackedValue),
    `const __qwik_vnode_internal__ = {
  _getDomContainer,
  _vnode_getFirstChild,
  _vnode_isVirtualVNode,
  _vnode_isMaterialized,
  _vnode_getAttrKeys,
};`,
    createRuntimeInstallerSource(__qwik_install_vnode_runtime__),
    createRuntimeCall('__qwik_install_vnode_runtime__', [
      {
        chunkKey: runtimeExpression('CHUNK_KEY'),
        componentTreeUpdateType: DEVTOOLS_MESSAGES.types.componentTreeUpdate,
        devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
        hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
        pageMessageSource: DEVTOOLS_MESSAGES.pageSource,
        qColon: runtimeExpression('QCOLON'),
        qId: runtimeExpression('QID'),
        qKey: runtimeExpression('QKEY'),
        qProps: runtimeExpression('QPROPS'),
        qRenderFn: runtimeExpression('QRENDERFN'),
        qType: runtimeExpression('QTYPE'),
        symbolKey: runtimeExpression('SYMBOL_KEY'),
        untrackedValueKey: runtimeExpression('UNTRACKED_VALUE_KEY'),
      },
      runtimeExpression('__qwik_vnode_internal__'),
    ]),
  ]);
}
