import type { ComponentCtx, QContext } from '../props/props';
import type { ContainerState } from './container';

/**
 * @alpha
 */
export interface RenderOperation {
  $el$: Node;
  $operation$: string;
  $args$: any[];
  $fn$: () => void;
}

/**
 * @alpha
 */
export interface RenderPerf {
  $visited$: number;
}

/**
 * @alpha
 */
export interface RenderContext {
  $doc$: Document;
  $roots$: Element[];
  $hostElements$: Set<Element>;
  $operations$: RenderOperation[];
  $contexts$: QContext[];
  $currentComponent$: ComponentCtx | undefined;
  $containerState$: ContainerState;
  $containerEl$: Element;
  $perf$: RenderPerf;
}
