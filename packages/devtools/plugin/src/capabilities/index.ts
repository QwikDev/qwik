import type { DevtoolsCapability } from '@qwik.dev/devtools/kit';
import { hooksCapability } from './hooks';
import { perfCapability } from './perf';
import { vnodeCapability } from './vnode';

export function getDevtoolsCapabilities(): DevtoolsCapability[] {
  return [hooksCapability, perfCapability, vnodeCapability];
}
