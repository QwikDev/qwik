/** @public @experimental */
export type RevealOrder = 'parallel' | 'sequential' | 'reverse' | 'together';

export interface RevealItemLike {
  boundary: {
    pending: {
      untrackedValue: number;
    };
  };
}

export interface RevealRegistrationLike<ITEM extends RevealItemLike = RevealItemLike> {
  reveal: {
    order: RevealOrder;
    items: ITEM[];
  };
  item: ITEM;
}

/** @internal */
export const canRevealRegistration = <ITEM extends RevealItemLike>(
  registration: RevealRegistrationLike<ITEM> | null,
  isPending: (item: ITEM) => boolean = (item) => item.boundary.pending.untrackedValue > 0
): boolean => {
  if (registration === null) {
    return true;
  }

  const reveal = registration.reveal;
  const current = registration.item;
  const items = reveal.items;

  switch (reveal.order) {
    case 'together':
      for (let i = 0; i < items.length; i++) {
        if (isPending(items[i])) {
          return false;
        }
      }
      return true;
    case 'sequential':
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item === current) {
          return true;
        }
        if (isPending(item)) {
          return false;
        }
      }
      return true;
    case 'reverse':
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item === current) {
          return true;
        }
        if (isPending(item)) {
          return false;
        }
      }
      return true;
    default:
      return true;
  }
};
