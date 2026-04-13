import {
  anyOf,
  createRegExp,
  exactly,
  global,
  whitespace,
  wordBoundary,
} from 'magic-regexp';

const notTrueLiteral = createRegExp(exactly('!true').and(wordBoundary), [global]);

const notFalseLiteral = createRegExp(exactly('!false').and(wordBoundary), [global]);

const ifBracedBoolLiteral = createRegExp(
  wordBoundary
    .and('if')
    .and(whitespace.times.any())
    .and('(')
    .and(whitespace.times.any())
    .and(anyOf('true', 'false').grouped())
    .and(whitespace.times.any())
    .and(')')
    .and(whitespace.times.any())
    .and('{'),
  [global],
);

const trueAndOp = createRegExp(
  wordBoundary.and('true').and(whitespace.times.any()).and('&&').and(whitespace.times.any()),
  [global],
);

const falseOrOp = createRegExp(
  wordBoundary.and('false').and(whitespace.times.any()).and('||').and(whitespace.times.any()),
  [global],
);

const falseAndOp = createRegExp(
  wordBoundary.and('false').and(whitespace.times.any()).and('&&').and(whitespace.times.any()),
  [global],
);

const elseClause = createRegExp(
  whitespace.times.any().and('else').and(whitespace.times.any()).and('{').at.lineStart(),
);

const dceGuard = createRegExp(
  wordBoundary.and(
    anyOf(
      exactly('if')
        .and(whitespace.times.any())
        .and('(')
        .and(whitespace.times.any())
        .and(anyOf('true', 'false', '!true', '!false'))
        .and(wordBoundary),
      exactly('true').and(whitespace.times.any()).and('&&'),
      exactly('false').and(whitespace.times.any()).and('||'),
      exactly('false').and(whitespace.times.any()).and('&&'),
    ),
  ),
);

export function hasSegmentDcePatterns(code: string): boolean {
  return dceGuard.test(code);
}

export function applySegmentDCE(code: string): string {
  let result = code;
  let changed = true;
  let iterations = 0;

  result = result.replace(notTrueLiteral, (match, offset) => {
    if (isInsideString(result, offset)) return match;
    return 'false';
  });
  result = result.replace(notFalseLiteral, (match, offset) => {
    if (isInsideString(result, offset)) return match;
    return 'true';
  });

  while (changed && iterations < 10) {
    changed = false;
    iterations++;

    const replacements: Array<{
      start: number;
      end: number;
      replacement: string;
    }> = [];

    ifBracedBoolLiteral.lastIndex = 0;
    let match;

    while ((match = ifBracedBoolLiteral.exec(result)) !== null) {
      const condValue = match[1] === 'true';
      const braceStart = match.index + match[0].length - 1;

      const closeIdx = findMatchingBrace(result, braceStart);
      if (closeIdx === -1) continue;

      const ifBody = result.slice(braceStart + 1, closeIdx);

      let elseBody: string | null = null;
      let totalEnd = closeIdx + 1;
      const afterClose = result.slice(closeIdx + 1).match(elseClause);
      if (afterClose) {
        const elseBraceStart = closeIdx + 1 + afterClose[0]!.length - 1;
        const elseCloseIdx = findMatchingBrace(result, elseBraceStart);
        if (elseCloseIdx !== -1) {
          elseBody = result.slice(elseBraceStart + 1, elseCloseIdx);
          totalEnd = elseCloseIdx + 1;
        }
      }

      const replacement = condValue ? ifBody : elseBody ?? '';
      replacements.push({
        start: match.index,
        end: totalEnd,
        replacement: replacement.trim(),
      });
    }

    const ifBracelessPattern = /\bif\s*\(\s*(true|false)\s*\)\s+(?!\{)/g;
    while ((match = ifBracelessPattern.exec(result)) !== null) {
      const matchStart = match.index;
      if (replacements.some((r) => matchStart >= r.start && matchStart < r.end)) {
        continue;
      }

      const condValue = match[1] === 'true';
      const stmtStart = match.index + match[0].length;
      const semiIdx = result.indexOf(';', stmtStart);
      if (semiIdx === -1) continue;

      const stmt = result.slice(stmtStart, semiIdx + 1).trim();
      let adjustedEnd = semiIdx + 1;
      if (result[adjustedEnd] === '\n') adjustedEnd++;

      replacements.push({
        start: match.index,
        end: adjustedEnd,
        replacement: condValue ? stmt : '',
      });
    }

    replacements.sort((a, b) => b.start - a.start);
    for (const replacement of replacements) {
      result =
        result.slice(0, replacement.start) +
        replacement.replacement +
        result.slice(replacement.end);
      changed = true;
    }
  }

  result = result.replace(trueAndOp, (match, offset) => {
    if (isInsideString(result, offset)) return match;
    return '';
  });
  result = result.replace(falseOrOp, (match, offset) => {
    if (isInsideString(result, offset)) return match;
    return '';
  });

  result = simplifyFalseAndExpressions(result);
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

  return result;
}

function isInsideString(text: string, offset: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let templateDepth = 0;
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    if (
      ch === '\\' &&
      (inSingle || inDouble || (inTemplate && templateDepth === 0))
    ) {
      i++;
      continue;
    }
    if (inTemplate && templateDepth > 0) {
      if (ch === '{') templateDepth++;
      else if (ch === '}') templateDepth--;
      continue;
    }
    if (inTemplate && ch === '$' && text[i + 1] === '{') {
      templateDepth = 1;
      i++;
      continue;
    }
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inTemplate = !inTemplate;
  }
  return inSingle || inDouble || (inTemplate && templateDepth === 0);
}

function findMatchingBrace(text: string, openPos: number): number {
  let depth = 1;
  let inString: string | null = null;
  let i = openPos + 1;

  while (i < text.length && depth > 0) {
    const ch = text[i];

    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') {
        inString = null;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') depth--;

    if (depth === 0) return i;
    i++;
  }
  return -1;
}

function simplifyFalseAndExpressions(code: string): string {
  falseAndOp.lastIndex = 0;
  let match;
  const replacements: Array<{
    start: number;
    end: number;
    replacement: string;
  }> = [];

  while ((match = falseAndOp.exec(code)) !== null) {
    const exprStart = match.index + match[0].length;
    const exprEnd = findExpressionEnd(code, exprStart);
    if (exprEnd > exprStart) {
      replacements.push({
        start: match.index,
        end: exprEnd,
        replacement: 'false',
      });
    }
  }

  if (replacements.length === 0) return code;

  let result = code;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i];
    result =
      result.slice(0, replacement.start) +
      replacement.replacement +
      result.slice(replacement.end);
  }
  return result;
}

function findExpressionEnd(code: string, start: number): number {
  let i = start;
  let inString: string | null = null;
  let angleBraceDepth = 0;
  let parenDepth = 0;
  let curlyDepth = 0;

  while (i < code.length) {
    const ch = code[i];

    if (inString) {
      if (ch === inString && code[i - 1] !== '\\') inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      i++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth === 0) return i;
      parenDepth--;
      i++;
      continue;
    }
    if (ch === '{') {
      curlyDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      if (curlyDepth === 0) return i;
      curlyDepth--;
      i++;
      continue;
    }
    if (ch === '<') {
      if (code[i + 1] === '/') {
        const closeEnd = code.indexOf('>', i);
        if (closeEnd >= 0 && angleBraceDepth > 0) {
          angleBraceDepth--;
          i = closeEnd + 1;
          if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
            return i;
          }
          continue;
        }
      }

      angleBraceDepth++;
      let j = i + 1;
      let tagCurly = 0;
      while (j < code.length) {
        if (code[j] === '{') tagCurly++;
        else if (code[j] === '}') tagCurly--;
        else if (code[j] === '>' && tagCurly === 0) {
          if (code[j - 1] === '/') {
            angleBraceDepth--;
            i = j + 1;
            if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
              return i;
            }
          } else {
            i = j + 1;
          }
          break;
        }
        j++;
      }
      if (j >= code.length) return code.length;
      continue;
    }

    if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
      if (ch === '\n' || ch === ';' || ch === ',') return i;
    }

    i++;
  }
  return i;
}
