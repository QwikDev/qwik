import { QWIK_VNODE_PROTOCOL } from '@qwik.dev/devtools/kit';
import { createVNodeRuntime } from '../runtime/create-vnode-runtime';

const vnodeBridge = createVNodeRuntime();

export const VNODE_BRIDGE_KEY = QWIK_VNODE_PROTOCOL.bridgeVirtualModuleId;
export default vnodeBridge;
