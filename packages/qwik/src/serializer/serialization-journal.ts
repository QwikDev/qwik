type JournalMap<K = any, V = any> = {
  get(key: K): V | undefined;
  has(key: K): boolean;
  set(key: K, value: V): unknown;
  delete(key: K): boolean;
};

/** Records only mutations made while preparing an unpublished packet. */
export class SerializationJournal {
  private entries: Array<() => void> = [];

  /** Direct field access preserves production property mangling. */
  record(undo: () => void): void {
    this.entries.push(undo);
  }

  assign<T, K extends keyof T>(target: T, key: K, value: T[K]): void {
    const previous = target[key];
    const exists = Object.prototype.hasOwnProperty.call(target, key);
    this.record(() => {
      if (exists) {
        target[key] = previous;
      } else {
        delete target[key];
      }
    });
    target[key] = value;
  }

  private recordMap<K, V>(target: JournalMap<K, V>, key: K): void {
    const previous = target.get(key);
    const exists = target.has(key);
    this.record(() => {
      if (exists) {
        target.set(key, previous!);
      } else {
        target.delete(key);
      }
    });
  }

  set<K, V>(target: JournalMap<K, V>, key: K, value: V): void {
    this.recordMap(target, key);
    target.set(key, value);
  }

  delete<K, V>(target: Map<K, V>, key: K): void {
    this.recordMap(target, key);
    target.delete(key);
  }

  add<T>(target: Set<T>, key: T): void {
    if (!target.has(key)) {
      this.record(() => target.delete(key));
      target.add(key);
    }
  }

  commit(): void {
    this.entries.length = 0;
  }

  rollback(): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      this.entries[i]();
    }
    this.commit();
  }
}
