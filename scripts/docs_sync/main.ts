import { dirname, join } from 'path';
import { readdir, stat, readFile, writeFile, linkSync } from 'fs';

export function main(dir: string) {
  console.log('DOC SYNC', dir);
  scanFiles(dir);
}

function scanFiles(dir: string) {
  readdir(dir, (err, files) => {
    if (err) throw err;
    files.forEach((file) => {
      const path = join(dir, file);
      stat(path, (err, status) => {
        if (err) throw err;
        if (status.isDirectory()) {
          scanFiles(path);
        }
        if (status.isFile() && file.endsWith('.ts')) {
          readFileLines(join(dir, file)).then((lines) => scanForDocDirective(dir, file, lines));
        }
      });
    });
  });
}

async function scanForDocDirective(dir: string, file: string, lines: string[]) {
  const output: string[] = [];
  let row = 0;
  let write = false;
  while (row < lines.length) {
    const line = lines[row++];
    output.push(line);
    const match = /^(\s*)\/\/ <docs markdown="(.*)#(.*)">/.exec(line);
    if (match) {
      const prefix = match[1];
      const ref = match[2];
      const section = match[3];
      output.push(prefix + `// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ${ref} instead)`);
      output.push(prefix + '/**');
      (await resolveComment(dir, ref, section)).forEach((longLine) =>
        breakLongLine(longLine).forEach((line) => output.push(prefix + ' * ' + line))
      );
      output.push(prefix + ' */');
      while (row < lines.length) {
        const line2 = lines[row++];
        if (!isComment(line2)) {
          throw new Error(
            'Missing end `</doc>` tag. Got: ' + line2 + '\n' + join(dir, file) + '[' + row + ']'
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
    await writeFileLines(join(dir, file), output);
  }
}

function isComment(line: string) {
  line = line.trim();
  return line.startsWith('//') || line.startsWith('/**') || line.startsWith('*');
}

async function resolveComment(dir: string, ref: string, section: string): Promise<string[]> {
  const lines = await readFileSection(join(dir, ref), section);
  let row = 0;
  let output: string[] = [];
  while (row < lines.length) {
    let line = lines[row++];
    const match = /<docs code="\.\/(.*)#(.*)"\/>/.exec(line);
    if (match) {
      output.push('```typescript');
      (await resolveCodeExample(join(dir, match[1]), match[2])).forEach((l) => output.push(l));
      output.push('```');
    } else {
      output.push(line);
    }
  }
  return output;
}

async function readFileLines(file: string): Promise<string[]> {
  return new Promise((res, rej) =>
    readFile(file, (err, data) => (err ? rej(err) : res(String(data).split('\n'))))
  );
}

async function readFileSection(file: string, section: string) {
  const lines = await readFileLines(file);
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

async function writeFileLines(file: string, lines: string[]) {
  return new Promise((res, rej) =>
    writeFile(file, lines.join('\n'), (err) => (err ? rej(err) : res(null)))
  );
}

async function resolveCodeExample(file: string, anchor: string): Promise<string[]> {
  const output: string[] = [];
  const lines = await readFileLines(file);
  let row = 0;
  while (row < lines.length) {
    const line = lines[row++];
    const match = /^(\s*)\/\/ <docs anchor="(.*)">/.exec(line);
    if (match && match[2] == anchor) {
      while (row < lines.length) {
        const offset = match[1].length;
        const line2 = lines[row++].substr(offset);
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
    output.push(longLine.substr(0, lastWhitespace - 1));
    longLine = longLine.substr(lastWhitespace).trim();
  }
  return output;
}
