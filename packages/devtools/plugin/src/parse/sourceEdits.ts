import type { SourceEdit } from './types';

export function applySourceEdits(code: string, edits: SourceEdit[]): string {
  if (edits.length === 0) {
    return code;
  }

  const orderedEdits = [...edits].sort((left, right) => getEditStart(right) - getEditStart(left));
  let result = code;

  for (const edit of orderedEdits) {
    if (edit.kind === 'insert') {
      result = result.slice(0, edit.pos) + edit.text + result.slice(edit.pos);
      continue;
    }

    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }

  return result;
}

function getEditStart(edit: SourceEdit): number {
  return edit.kind === 'insert' ? edit.pos : edit.start;
}
