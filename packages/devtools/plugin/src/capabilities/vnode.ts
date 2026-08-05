import { QWIK_VNODE_PROTOCOL, type DevtoolsCapability } from '@qwik.dev/devtools/kit';
import vnodeBridgeSource from '../virtualmodules/vnodeBridge';

export const vnodeCapability: DevtoolsCapability = {
  name: 'vnode',
  virtualModules: [
    {
      id: QWIK_VNODE_PROTOCOL.bridgeVirtualModuleId,
      load: () => vnodeBridgeSource,
    },
  ],
};
