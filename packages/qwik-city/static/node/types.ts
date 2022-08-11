import type {
  StaticGeneratorOptions,
  StaticWorkerRenderConfig,
  StaticWorkerRenderResult,
} from '../generator/types';

export interface NodeStaticGeneratorOptions extends StaticGeneratorOptions {}

export interface NodeStaticWorkerRenderConfig extends StaticWorkerRenderConfig {
  taskId: number;
}

export interface NodeStaticWorkerRenderResult extends StaticWorkerRenderResult {
  taskId: number;
}
