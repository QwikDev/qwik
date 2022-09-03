import type { QContext } from '../props/props';
import type { ContainerState } from './container';
import type { QwikElement } from './dom/virtual-element';

/**
 * @alpha
 */
export interface RenderOperation {
  $operation$: (...args: any[]) => void;
  $args$: any[];
}

/**
 * @alpha
 */
export interface RenderContext {
  $static$: RenderStaticContext;
  $localStack$: QContext[];
  $cmpCtx$: QContext | undefined;
}

export interface RenderStaticContext {
  $doc$: Document;
  $roots$: QContext[];
  $hostElements$: Set<QwikElement>;
  $operations$: RenderOperation[];
  $postOperations$: RenderOperation[];
  $containerState$: ContainerState;
  $containerEl$: Element;
  $addSlots$: [QwikElement, QwikElement][];
  $rmSlots$: QwikElement[];
}

/**
 * @alpha
 */
export interface RenderContext2 {}
