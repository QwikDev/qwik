/** JSX whitespace normalization: whole-whitespace lines vanish, interior runs join with one space. */
export function normalizeJsxText(value: string): string {
  if (!value.includes('\n') && !value.includes('\r')) {
    return value;
  }
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  let lastNonEmptyLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) {
      lastNonEmptyLine = i;
    }
  }
  if (lastNonEmptyLine === -1) {
    return '';
  }
  let text = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, ' ');
    if (i !== 0) {
      line = line.replace(/^ +/, '');
    }
    if (i !== lines.length - 1) {
      line = line.replace(/ +$/, '');
    }
    if (line) {
      text += line;
      if (i !== lastNonEmptyLine) {
        text += ' ';
      }
    }
  }
  return text;
}
