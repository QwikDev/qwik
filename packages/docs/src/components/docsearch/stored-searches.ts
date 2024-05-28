import { noSerialize } from '@builder.io/qwik';
import type { DocSearchHit, StoredDocSearchHit } from './types';

function isLocalStorageSupported() {
  const key = '__TEST_KEY__';

  try {
    localStorage.setItem(key, '');
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

function createStorage<TItem>(key: string) {
  if (isLocalStorageSupported() === false) {
    return {
      setItem() {},
      getItem() {
        return [];
      },
    };
  }

  return {
    setItem(item: TItem[]) {
      try {
        return window.localStorage.setItem(key, JSON.stringify(item));
      } catch (err) {
        //
      }
    },
    getItem(): TItem[] {
      let item = [];
      try {
        const value = window.localStorage.getItem(key) || '[]';
        item = JSON.parse(value);
      } catch (err) {
        //
      }
      return item;
    },
  };
}

type CreateStoredSearchesOptions = {
  key: string;
  limit?: number;
};

export type StoredSearchPlugin<TItem> = {
  add: (item: TItem) => void;
  remove: (item: TItem) => void;
  getAll: () => TItem[];
};

export function createStoredSearches<TItem extends StoredDocSearchHit>({
  key,
  limit = 5,
}: CreateStoredSearchesOptions): StoredSearchPlugin<TItem> {
  const storage = createStorage<TItem>(key);
  let items = storage.getItem().slice(0, limit);

  // @ts-ignore
  return noSerialize({
    add(item: TItem) {
      const { _highlightResult, _snippetResult, ...hit } = item as unknown as DocSearchHit;

      const isQueryAlreadySaved = items.findIndex((x) => x.objectID === hit.objectID);

      if (isQueryAlreadySaved > -1) {
        items.splice(isQueryAlreadySaved, 1);
      }

      items.unshift(hit as TItem);
      items = items.slice(0, limit);

      storage.setItem(items);
    },
    remove(item: TItem) {
      items = items.filter((x) => x.objectID !== item.objectID);

      storage.setItem(items);
    },
    getAll() {
      return items;
    },
  });
}
