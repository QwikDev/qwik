import type { LinkedModule } from '../schema';

/** Allocates function locals without shadowing authored bindings. */
export function createNameAllocator(module: LinkedModule) {
  const usedNames = new Set(module.bindings.map((binding) => binding.name));
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    let index = indexes.get(prefix) ?? 0;
    let name: string;
    do {
      name = `${prefix}${index++}`;
    } while (usedNames.has(name));
    indexes.set(prefix, index);
    usedNames.add(name);
    return name;
  };
}
