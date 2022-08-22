import type {
  AutocompleteCollection,
  AutocompleteState,
  BaseItem,
} from '@algolia/autocomplete-core';

// We don't have access to the autocomplete source when we call `onKeyDown`
// or `onClick` because those are native browser events.

// However, we can get the source from the suggestion index.
function getCollectionFromActiveItemId<TItem extends BaseItem>(
  state: AutocompleteState<TItem>
): AutocompleteCollection<TItem> | undefined {
  // Given 3 sources with respectively 1, 2 and 3 suggestions: [1, 2, 3]
  // We want to get the accumulated counts:
  // [1, 1 + 2, 1 + 2 + 3] = [1, 3, 3 + 3] = [1, 3, 6]
  const accumulatedCollectionsCount = state.collections
    .map((collections) => collections.items.length)
    .reduce<number[]>((acc, collectionsCount, index) => {
      const previousValue = acc[index - 1] || 0;
      const nextValue = previousValue + collectionsCount;

      acc.push(nextValue);

      return acc;
    }, []);

  // Based on the accumulated counts, we can infer the index of the suggestion.
  const collectionIndex = accumulatedCollectionsCount.reduce((acc, current) => {
    if (current <= state.activeItemId!) {
      return acc + 1;
    }

    return acc;
  }, 0);

  return state.collections[collectionIndex];
}

/**
 * Gets the highlighted index relative to a suggestion object (not the absolute
 * highlighted index).
 *
 * Example:
 *  [['a', 'b'], ['c', 'd', 'e'], ['f']]
 *                      ↑
 *         (absolute: 3, relative: 1)
 */
function getRelativeActiveItemId<TItem extends BaseItem>({
  state,
  collection,
}: {
  state: AutocompleteState<TItem>;
  collection: AutocompleteCollection<TItem>;
}): number {
  let isOffsetFound = false;
  let counter = 0;
  let previousItemsOffset = 0;

  while (isOffsetFound === false) {
    const currentCollection = state.collections[counter];

    if (currentCollection === collection) {
      isOffsetFound = true;
      break;
    }

    previousItemsOffset += currentCollection.items.length;

    counter++;
  }

  return state.activeItemId! - previousItemsOffset;
}

export function getActiveItem<TItem extends BaseItem>(state: AutocompleteState<TItem>) {
  const collection = getCollectionFromActiveItemId(state);

  if (!collection) {
    return null;
  }

  const item = collection.items[getRelativeActiveItemId({ state, collection })];

  return {
    item,
    itemUrl: item.url as string,
  };
}
