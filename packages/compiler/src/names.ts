/** Generated-name allocation shared by analysis and generation (phase-neutral). */
import type { LinkedModule } from './schema';

export function allocateGeneratedName(base: string, bound: readonly string[]): string {
  if (!bound.includes(base)) {
    return base;
  }
  for (let index = 0; ; index++) {
    const candidate = `${base}${index}`;
    if (!bound.includes(candidate)) {
      return candidate;
    }
  }
}

/** Every name an authored binding of the module takes; build it once per module. */
export function authoredNames(module: LinkedModule): Set<string> {
  return new Set(module.bindings.map((binding) => binding.name));
}

/** Allocates function locals without shadowing authored bindings. */
export function createNameAllocator(authored: ReadonlySet<string>) {
  const allocated = new Set<string>();
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    let index = indexes.get(prefix) ?? 0;
    let name: string;
    do {
      name = `${prefix}${index++}`;
    } while (authored.has(name) || allocated.has(name));
    indexes.set(prefix, index);
    allocated.add(name);
    return name;
  };
}
