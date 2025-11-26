import type { Signal } from './signal.public';

export interface NodePropData {
  $scopedStyleIdPrefix$: string | null;
  $isConst$: boolean;
}

export interface NodePropPayload extends NodePropData {
  $value$: Signal<unknown>;
}

/** @internal */
export class SubscriptionData {
  data: NodePropData;

  constructor(data: NodePropData) {
    this.data = data;
  }
}

export interface NodeProp {
  isConst: boolean;
  scopedStyleIdPrefix: string | null;
  value: Signal<unknown> | string;
}
