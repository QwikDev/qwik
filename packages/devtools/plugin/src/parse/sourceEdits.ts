import type { SourceEdit } from './types';

export function applySourceEdits(code: string, edits: SourceEdit[]): string {
  if (edits.length === 0) {
    return code;
  }

  // Applied from the end; inserts sharing a position keep the order they were added in.
  const orderedEdits = edits
    .map((edit, index) => ({ edit, index }))
    .sort(
      (left, right) =>
        getEditStart(right.edit) - getEditStart(left.edit) || right.index - left.index
    )
    .map(({ edit }) => edit);
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
