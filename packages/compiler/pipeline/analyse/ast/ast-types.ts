/** Minimal structural AST typing (oxc-parser estree-ish nodes; every node carries start/end). */

export interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
