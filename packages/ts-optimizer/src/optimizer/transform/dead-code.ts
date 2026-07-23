import {
  anyOf,
  createRegExp,
  exactly,
  global,
  oneOrMore,
  whitespace,
  wordBoundary,
} from 'magic-regexp';
import { isInsideString, findMatchingBrace, findExpressionEnd } from '../edit/text-scanning.js';
import { applyReplacements } from '../edit/range-replace.js';

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
  [global]
);

const trueAndOp = createRegExp(
  wordBoundary.and('true').and(whitespace.times.any()).and('&&').and(whitespace.times.any()),
  [global]
);

const falseOrOp = createRegExp(
  wordBoundary.and('false').and(whitespace.times.any()).and('||').and(whitespace.times.any()),
  [global]
);

const falseAndOp = createRegExp(
  wordBoundary.and('false').and(whitespace.times.any()).and('&&').and(whitespace.times.any()),
  [global]
);

const elseClause = createRegExp(
  whitespace.times.any().and('else').and(whitespace.times.any()).and('{').at.lineStart()
);

const ifBracelessPattern = createRegExp(
  wordBoundary
    .and(exactly('if'))
    .and(whitespace.times.any())
    .and(exactly('('))
    .and(whitespace.times.any())
    .and(anyOf('true', 'false').grouped())
    .and(whitespace.times.any())
    .and(exactly(')'))
    .and(oneOrMore(whitespace))
    .notBefore(exactly('{')),
  [global]
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
      exactly('false').and(whitespace.times.any()).and('&&')
    )
  )
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
      // Skip a fold nested inside one already collected this pass: applying
      // the inner edit shifts later offsets and invalidates the outer fold's
      // stale `end`. The `while (changed)` loop re-folds it next iteration.
      if (replacements.some((r) => match!.index >= r.start && match!.index < r.end)) {
        continue;
      }

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

      const replacement = condValue ? ifBody : (elseBody ?? '');
      replacements.push({
        start: match.index,
        end: totalEnd,
        replacement: replacement.trim(),
      });
    }

    ifBracelessPattern.lastIndex = 0;
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

    if (replacements.length > 0) {
      result = applyReplacements(result, replacements);
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

  return applyReplacements(code, replacements);
}
