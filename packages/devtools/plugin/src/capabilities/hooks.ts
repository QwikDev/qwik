import {
  INNER_USE_HOOK,
  VIRTUAL_QWIK_DEVTOOLS_KEY,
  type DevtoolsCapability,
} from '@qwik.dev/devtools/kit';
import useCollectHooksSource from '../virtualmodules/useCollectHooks';

export const hooksCapability: DevtoolsCapability = {
  name: 'hooks',
  virtualModules: [
    {
      id: VIRTUAL_QWIK_DEVTOOLS_KEY,
      load: () => useCollectHooksSource,
    },
  ],
};
