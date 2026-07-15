import type { JSXOutput } from './shared/jsx/types/jsx-node';

/** @public */
export type RenderRoot<Props = undefined> = (props: Props) => JSXOutput;

/** @public */
export interface RenderOptions<Props = undefined> {
  props?: Props;
  serverData?: Record<string, any>;
}

/** @public */
export interface RenderResult {
  cleanup(): void;
}
