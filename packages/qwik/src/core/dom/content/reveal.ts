import type { FunctionComponent, JSXOutput } from '../../shared/jsx/types/jsx-node';

/** @public */
export type RevealOrder = 'parallel' | 'sequential' | 'reverse' | 'together';

/** @public */
export interface RevealProps {
  readonly order?: RevealOrder;
  readonly collapsed?: boolean;
}

/**
 * Groups the Suspense boundaries lexically inside it and coordinates when each may reveal. The
 * compiler wires the boundaries statically; nothing renders for the component itself.
 *
 * @public
 */
export const Reveal: FunctionComponent<RevealProps & { children?: JSXOutput }> = () => null;

/**
 * One compiled `<Reveal>` scope: the boundaries register by their lexical index and hold their
 * output until the order allows it.
 */
export class RevealGroup {
  private pending = new Set<number>();
  private held: Array<[index: number, show: () => void]> = [];

  constructor(
    readonly order: RevealOrder,
    readonly collapsed: boolean,
    count: number
  ) {
    // every boundary is pending up front: later siblings gate earlier ones (reverse/together)
    for (let index = 0; index < count; index++) {
      this.pending.add(index);
    }
  }

  canReveal(index: number): boolean {
    switch (this.order) {
      case 'together':
        return this.pending.size === 0;
      case 'sequential': {
        for (const pending of this.pending) {
          if (pending < index) {
            return false;
          }
        }
        return true;
      }
      case 'reverse': {
        for (const pending of this.pending) {
          if (pending > index) {
            return false;
          }
        }
        return true;
      }
      default:
        return true;
    }
  }

  mayShowFallback(index: number): boolean {
    return !this.collapsed || this.canReveal(index);
  }

  /** Run `show` once the order allows this boundary; immediately when it already does. */
  whenRevealable(index: number, show: () => void): void {
    if (this.canReveal(index)) {
      show();
      return;
    }
    this.held.push([index, show]);
  }

  resolve(index: number): void {
    if (!this.pending.delete(index)) {
      return;
    }
    const held = this.held;
    this.held = [];
    for (const [heldIndex, show] of held) {
      this.whenRevealable(heldIndex, show);
    }
  }
}

/** @internal */
export const createRevealGroup = (
  order?: RevealOrder,
  collapsed?: boolean,
  count = 0
): RevealGroup => new RevealGroup(order ?? 'parallel', collapsed === true, count);
