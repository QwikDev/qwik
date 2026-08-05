import { PERF_VIRTUAL_MODULE_ID, type DevtoolsCapability } from '@qwik.dev/devtools/kit';
import qwikComponentProxySource from '../virtualmodules/qwikComponentProxy';

export const perfCapability: DevtoolsCapability = {
  name: 'perf',
  virtualModules: [
    {
      id: PERF_VIRTUAL_MODULE_ID,
      load: () => qwikComponentProxySource,
    },
  ],
};
