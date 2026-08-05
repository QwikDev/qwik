import { normalizeExcludePathnames } from '../../../kit/src/overlay-paths';
import { readIndent } from '../parse/helpers';
import { applySourceEdits } from '../parse/sourceEdits';
import { parseProgram, traverseProgram } from '../parse/traverse';

export interface QwikDevtoolsOptions {
  overlay?: {
    excludePathnames?: string[];
  };
}

const DEVTOOLS_IMPORT = `import { QwikDevtools } from '@qwik.dev/devtools/ui';`;
const STYLES_IMPORT = `import '@qwik.dev/devtools/ui/styles.css';`;

export function transformRootFile(code: string, opts: QwikDevtoolsOptions = {}): string {
  const excludePathnames = normalizeExcludePathnames(opts.overlay?.excludePathnames);
  const bodyInsertion = findBodyInsertion(code);
  if (bodyInsertion !== null) {
    const devtoolsElement =
      excludePathnames.length > 0
        ? `<QwikDevtools excludePathnames={${JSON.stringify(excludePathnames)}} />`
        : '<QwikDevtools />';
    code = applySourceEdits(code, [
      {
        kind: 'insert',
        pos: bodyInsertion.pos,
        text: `${bodyInsertion.prefix}${devtoolsElement}${bodyInsertion.suffix}`,
      },
    ]);
  }

  if (!code.includes(DEVTOOLS_IMPORT)) {
    code = `${DEVTOOLS_IMPORT}\n${code}`;
  }

  if (!code.includes(STYLES_IMPORT)) {
    code = `${STYLES_IMPORT}\n${code}`;
  }

  return code;
}

function findBodyInsertion(code: string): { pos: number; prefix: string; suffix: string } | null {
  const edits: BodyInsertionEdit[] = [];

  try {
    const program = parseProgram(code);
    traverseProgram(program, {
      JSXElement(path) {
        const node = path.node as JsxElementNode;
        if (getJsxName(node.openingElement?.name) !== 'body' || !node.closingElement) {
          return;
        }

        const closingStart = node.closingElement.start;
        const lineStart = findLineStart(code, closingStart);
        const closingIndent = readIndent(code, lineStart);
        const hasOnlyIndentBeforeClosing = code.slice(lineStart, closingStart).trim() === '';
        edits.push({
          pos: hasOnlyIndentBeforeClosing ? lineStart : closingStart,
          prefix: hasOnlyIndentBeforeClosing ? `${closingIndent}  ` : `\n${closingIndent}  `,
          suffix: hasOnlyIndentBeforeClosing ? '\n' : '',
        });
        path.stop();
      },
    });
  } catch (_) {
    return null;
  }

  const edit = edits[0];
  return edit ?? null;
}

function findLineStart(code: string, index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const ch = code[i];
    if (ch === '\n' || ch === '\r') {
      return i + 1;
    }
  }
  return 0;
}

function getJsxName(name: unknown): string | undefined {
  if (!name || typeof name !== 'object') {
    return undefined;
  }
  const record = name as { type?: string; name?: string };
  return record.type === 'JSXIdentifier' ? record.name : undefined;
}

interface JsxElementNode {
  openingElement?: {
    name?: unknown;
  };
  closingElement?: {
    start: number;
  };
}

interface BodyInsertionEdit {
  pos: number;
  prefix: string;
  suffix: string;
}
