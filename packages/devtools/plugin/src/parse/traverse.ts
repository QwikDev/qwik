import { parseSync } from 'oxc-parser';
import { isAstNodeLike } from './helpers';

// ============================================================================
// Types
// ============================================================================

export interface NodePath<T = any> {
  node: T;
  parent: any | null;
  key: string | number | null;
  index: number | null;
  state: any;
  stop: () => void;
  skip: () => void;
}

type VisitFn = (path: NodePath) => void;
type VisitObj = { enter?: VisitFn; exit?: VisitFn };

export type Visitor = {
  enter?: VisitFn;
  exit?: VisitFn;
  [type: string]: VisitFn | VisitObj | undefined;
};

// ============================================================================
// Parser
// ============================================================================

/** Parses TypeScript/JSX code into an AST using oxc-parser */
export function parseProgram(code: string): unknown {
  const parsed = parseSync('file.tsx', code, {
    lang: 'tsx',
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  return parsed.program as unknown;
}

// ============================================================================
// Traverser
// ============================================================================

/** Calls the appropriate visitor function for enter/exit events */
function callVisitor(
  visitor: Visitor | undefined,
  type: string,
  hook: 'enter' | 'exit',
  path: NodePath
): void {
  if (!visitor) {
    return;
  }

  // Call generic enter/exit handler
  const specific = visitor[type] as VisitFn | undefined;
  if (specific) {
    specific(path);
  }

  // Call type-specific handler
  const handler = visitor[path.node && (path.node as any).type] as VisitFn | VisitObj | undefined;
  if (!handler) {
    return;
  }

  if (typeof handler === 'function' && hook === 'enter') {
    handler(path);
    return;
  }

  if (typeof handler === 'object') {
    const fn = handler[hook];
    if (fn) {
      fn(path);
    }
  }
}

/** Traverses an AST program with a visitor pattern */
export function traverseProgram(program: unknown, visitor: Visitor, state?: any): void {
  let shouldStopAll = false;

  function traverse(
    node: unknown,
    parent: unknown,
    key: string | number | null,
    index: number | null
  ): void {
    if (shouldStopAll) {
      return;
    }
    if (!isAstNodeLike(node)) {
      return;
    }

    let shouldSkipChildren = false;

    const path: NodePath = {
      node,
      parent: isAstNodeLike(parent) ? parent : null,
      key,
      index,
      state,
      stop: () => {
        shouldStopAll = true;
      },
      skip: () => {
        shouldSkipChildren = true;
      },
    };

    // Enter phase
    callVisitor(visitor, 'enter', 'enter', path);

    // Traverse children
    if (!shouldSkipChildren) {
      const record = node as Record<string, unknown>;
      for (const k of Object.keys(record)) {
        const value = record[k];
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            traverse(value[i], node, k, i);
          }
        } else {
          traverse(value, node, k, null);
        }
      }
    }

    // Exit phase
    callVisitor(visitor, 'exit', 'exit', path);
  }

  traverse(program, null, null, null);
}

/** Parses code and traverses the resulting AST */
export function traverseQwik(code: string, visitor: Visitor, state?: any): void {
  const program = parseProgram(code);
  traverseProgram(program, visitor, state);
}
