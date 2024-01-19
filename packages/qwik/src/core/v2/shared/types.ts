import type { SubscriptionManager } from '../../state/common';
import type { VirtualVNode } from '../client/types';
import type { VNodeJournalEntry } from '../client/vnode-diff';

/// Temporary type left behind which needs to be fixed.
export type fixMeAny = any;

export interface Container2 {
  markForRender(hostElement: VirtualVNode): void;
  $subsManager$: SubscriptionManager;
  $journal$: VNodeJournalEntry[];
  /// Current language locale
  qLocale: string;
  /// Retrieve Object from paused serialized state.
  getObjectById: (id: number | string) => any;
}

export interface QElement2 extends HTMLElement {
  qDispatchEvent?: (event: Event) => boolean;
}
