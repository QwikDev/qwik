import { traverseProgram } from './traverse';

export interface ComponentBodyRange {
  insertPos: number;
  bodyStart: number;
  bodyEnd: number;
  exportName?: string;
}

export function findAllComponentBodyRangesFromProgram(program: unknown): ComponentBodyRange[] {
  const ranges: ComponentBodyRange[] = [];

  traverseProgram(program, {
    enter: (path) => {
      const range = getComponentBodyRange(path.node, path.parent);
      if (range) {
        ranges.push(range);
      }
    },
  });

  return deduplicateRanges(ranges);
}

function getComponentBodyRange(node: any, parent: any): ComponentBodyRange | null {
  if (!isComponentCall(node)) {
    return null;
  }

  const body = getComponentFunctionBody(node);
  if (!body?.range) {
    return null;
  }

  const [bodyStart, bodyEnd] = body.range as [number, number];

  return {
    insertPos: bodyStart + 1,
    bodyStart,
    bodyEnd,
    exportName: detectExportName(parent),
  };
}

function isComponentCall(node: any): boolean {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'component$'
  );
}

function getComponentFunctionBody(node: any): { range?: [number, number] } | null {
  const componentFactory = node.arguments?.[0];
  const isFunctionFactory =
    componentFactory?.type === 'ArrowFunctionExpression' ||
    componentFactory?.type === 'FunctionExpression';

  if (!isFunctionFactory) {
    return null;
  }

  return componentFactory.body?.type === 'BlockStatement' ? componentFactory.body : null;
}

function detectExportName(parent: any): string | undefined {
  if (!parent) return undefined;

  if (parent.type === 'ExportDefaultDeclaration') {
    return '';
  }

  if (parent.type === 'VariableDeclarator') {
    const identifier = parent.id;
    if (identifier?.type === 'Identifier' && typeof identifier.name === 'string') {
      return identifier.name;
    }
  }

  return undefined;
}

function deduplicateRanges(ranges: ComponentBodyRange[]): ComponentBodyRange[] {
  const seen = new Set<number>();

  return ranges
    .filter((range) => {
      if (seen.has(range.insertPos)) {
        return false;
      }

      seen.add(range.insertPos);
      return true;
    })
    .sort((left, right) => left.insertPos - right.insertPos);
}
