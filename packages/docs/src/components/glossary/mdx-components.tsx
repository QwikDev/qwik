import { Term } from './term';

/**
 * MDX provider: exposes `<Term>` to every `.mdx` file without a per-file import. Wired via
 * `providerImportSource` in vite.config.ts. Locally imported components still win.
 */
export function useMDXComponents(components: Record<string, unknown>) {
  return { ...components, Term };
}
