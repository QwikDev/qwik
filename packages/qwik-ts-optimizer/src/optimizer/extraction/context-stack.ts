
import { createRegExp, exactly, oneOrMore, char } from 'magic-regexp';
import { buildDisplayName, buildSymbolName } from '../../hashing/naming.js';
import { getFileStem } from '../../paths.js';
import type { DisplayName, SymbolName } from '../types/brands.js';

const catchAllRouteParam = createRegExp(
  exactly('[[...').and(oneOrMore(char).grouped()).and(']]').at.lineStart().at.lineEnd(),
);

const dynamicRouteParam = createRegExp(
  exactly('[').and(oneOrMore(char).grouped()).and(']').at.lineStart().at.lineEnd(),
);

function extractFileStem(fileName: string): string {
  let stem = getFileStem(fileName);

  const catchAllMatch = stem.match(catchAllRouteParam);
  if (catchAllMatch) {
    return catchAllMatch[1]!;
  }

  const dynamicMatch = stem.match(dynamicRouteParam);
  if (dynamicMatch) {
    return dynamicMatch[1]!;
  }

  return stem;
}

export class ContextStack {
  private stack: string[] = [];
  private fileStem: string;
  private fileName: string;
  private relPath: string;
  private scope: string | undefined;

  constructor(fileStem: string, relPath: string, scope?: string, fileName?: string) {
    this.fileStem = fileStem;
    this.fileName = fileName ?? fileStem;
    this.relPath = relPath;
    this.scope = scope;
  }

  push(name: string): void {
    this.stack.push(name);
  }

  pop(): void {
    this.stack.pop();
  }

  peek(offset: number = 0): string | undefined {
    const idx = this.stack.length - 1 - offset;
    return idx >= 0 ? this.stack[idx] : undefined;
  }

  pushDefaultExport(): void {
    const stem = extractFileStem(this.fileStem);
    this.stack.push(stem);
  }

  getDisplayName(): DisplayName {
    return buildDisplayName(this.fileName, this.stack);
  }

  getSymbolName(): SymbolName {
    return buildSymbolName(this.getDisplayName(), this.scope, this.relPath);
  }

  getContextStack(): string[] {
    return [...this.stack];
  }

  get depth(): number {
    return this.stack.length;
  }
}
