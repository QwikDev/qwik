import type { ComponentCtx, QContext } from '../props/props';
import type { ContainerState } from './container';
import type { QwikElement, VirtualElement } from './dom/virtual-element';

/**
 * @alpha
 */
export interface RenderOperation {
  $el$: Node | VirtualElement;
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
  $roots$: QwikElement[];
  $hostElements$: Set<QwikElement>;
  $operations$: RenderOperation[];
  $postOperations$: RenderOperation[];
  $localStack$: QContext[];
  $currentComponent$: ComponentCtx | undefined;
  $containerState$: ContainerState;
  $containerEl$: Element;
  $perf$: RenderPerf;
}
