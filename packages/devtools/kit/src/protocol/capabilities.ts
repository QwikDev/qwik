export type DevtoolsCapabilityName = 'hooks' | 'perf' | 'vnode';

export interface VirtualModuleDefinition {
  id: string;
  load: () => string;
}

export interface DevtoolsCapability {
  name: DevtoolsCapabilityName;
  virtualModules?: VirtualModuleDefinition[];
}
