import {
  anyOf,
  createRegExp,
  exactly,
  global,
  oneOrMore,
  whitespace,
  wordBoundary,
} from 'magic-regexp';
import {
  isInsideString,
  findMatchingBrace,
  findExpressionEnd,
} from '../utils/text-scanning.js';

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

    // Matches `if (true) ` or `if (false) ` NOT followed by `{` (braceless if)
    const ifBracelessPattern = createRegExp(
      wordBoundary.and(exactly('if')).and(whitespace.times.any()).and(exactly('('))
        .and(whitespace.times.any())
        .and(anyOf('true', 'false').grouped())
        .and(whitespace.times.any()).and(exactly(')'))
        .and(oneOrMore(whitespace))
        .notBefore(exactly('{')),
      [global],
    );
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

