import { join, dirname } from 'path';
import { readLines, scanFiles, writeFileLines } from './util';

export function main(dir: string) {
  console.log('DOC SYNC', dir);
  scanFiles(dir, async (file) => {
    if (file.endsWith('.ts')) {
      await readLines(file).then((lines) => scanForDocDirective(file, lines));
    }
  });
}

async function scanForDocDirective(file: string, lines: string[]) {
  const output: string[] = [];
  let row = 0;
  let write = false;
  while (row < lines.length) {
    const line = lines[row++];
    output.push(line);
    const match = /^(\s*)\/\/ <docs markdown="(.*)#(.*)">/.exec(line);
    if (match) {
      const prefix = match[1];
      console.log('line', line, JSON.stringify(prefix));
      const ref = match[2];
      const section = match[3];
      let bookRef = ref.replace(/\/\/hackmd.io\//, '//hackmd.io/@qwik-docs/BkxpSz80Y/%2F');
      if (bookRef.indexOf('hackmd.io') !== -1) {
        bookRef += '%3Fboth';
      }
      output.push(prefix + `// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!`);
      output.push(prefix + `// (edit ${bookRef}#${section} instead)`);
      output.push(prefix + '/**');
      (await resolveComment(dirname(file), ref, section)).forEach((longLine) =>
        breakLongLine(longLine).forEach((line) =>
          output.push(prefix + ' *' + (line ? ' ' + line : ''))
        )
      );
      output.push(prefix + ' */');
      while (row < lines.length) {
        const line2 = lines[row++];
        if (!isComment(line2)) {
          throw new Error(
            'Missing end `</doc>` tag. Got: ' + line2 + '\n' + file + '[' + row + ']'
          );
        }
        if (line2.indexOf('// </docs>') != -1) {
          output.push(line2);
          break;
        }
      }
      write = true;
    }
  }
  if (write) {
    await writeFileLines(file, output);
  }
}

function isComment(line: string): boolean {
  line = line.trim();
  return line.startsWith('//') || line.startsWith('/**') || line.startsWith('*');
}

async function resolveComment(dir: string, ref: string, section: string): Promise<string[]> {
  const fileReadme = join(dir, ref);
  const lines = await readFileSection(fileReadme, section);
  let row = 0;
  let output: string[] = [];
  const dirReadme = dirname(fileReadme);
  while (row < lines.length) {
    let line = lines[row++];
    const match = /<docs code="\.\/(.*)#(.*)"\/>/.exec(line);
    if (match) {
      output.push('```tsx');
      (await resolveCodeExample(join(dirReadme, match[1]), match[2])).forEach((l) =>
        output.push(l)
      );
      output.push('```');
    } else {
      output.push(line);
    }
  }
  return output;
}

async function readFileSection(file: string, section: string) {
  const lines = await readLines(file);
  let sectionStart = '# `' + section + '`';
  let row = 0;
  let output: string[] = [];
  let inSection = false;
  while (row < lines.length) {
    const line = lines[row++];
    if (line === sectionStart) {
      inSection = true;
    } else if (line.startsWith('# ')) {
      inSection = false;
    } else if (inSection) {
      output.push(line);
    }
  }
  while (output.length && output[0] == '') {
    output.shift();
  }
  while (output.length && output[output.length - 1] == '') {
    output.pop();
  }
  return output;
}

async function resolveCodeExample(file: string, anchor: string): Promise<string[]> {
  const output: string[] = [];
  const lines = await readLines(file);
  let row = 0;
  while (row < lines.length) {
    const line = lines[row++];
    const match = /^(\s*)\/\/ <docs anchor="(.*)">/.exec(line);
    if (match && match[2] == anchor) {
      while (row < lines.length) {
        const offset = match[1].length;
        const line2 = lines[row++].slice(offset);
        const match2 = /\/\/ <\/docs>/.exec(line2);
        if (match2) {
          break;
        }
        output.push(line2);
      }
    }
  }
  return output;
}

const LINE_WIDTH = 95;

function breakLongLine(longLine: string): string[] {
  if (longLine.length < LINE_WIDTH) return [longLine];
  const output: string[] = [];
  while (longLine) {
    if (longLine.length < LINE_WIDTH) {
      output.push(longLine);
      break;
    }
    let index = 0;
    let lastWhitespace = index;
    while (index < longLine.length && index < LINE_WIDTH) {
      if (longLine[index++].match(/\s/)) {
        lastWhitespace = index;
      }
    }
    if (lastWhitespace == 0) {
      output.push(longLine);
      break;
    }
    output.push(longLine.slice(0, lastWhitespace - 1));
    longLine = longLine.slice(lastWhitespace).trim();
  }
  return output;
}
