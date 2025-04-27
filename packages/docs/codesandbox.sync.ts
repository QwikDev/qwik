import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function scanFiles(
  path: string,
  filePredicate: (path: string) => boolean,
  fileCallback: (path: string) => void
) {
  readdirSync(path, { withFileTypes: true }).forEach((dirent) => {
    if (dirent.isDirectory()) {
      scanFiles(join(path, dirent.name), filePredicate, fileCallback);
    } else if (dirent.isFile()) {
      if (filePredicate(dirent.name)) {
        fileCallback(join(path, dirent.name));
      }
    }
  });
}

function mdxFiles(path: string) {
  return path.endsWith('.mdx');
}

function transformFile(
  path: string,
  lineTransformFn: (path: string, lines: string[]) => string[]
): void {
  const lines = readFile(path);
  const newLines = lineTransformFn(path, lines);
  writeFileSync(path, newLines.join('\n'));
}

function readFile(path: string) {
  try {
    const file = readFileSync(path, 'utf-8');
    return file.split('\n');
  } catch (e) {
    console.error('Error reading file: ' + path);
    throw e;
  }
}

function findCodeSandboxes(
  codeSandboxTransformFn: (mdxPath: string, srcPath: string, lines: string[]) => string[],
  mdxPath: string,
  lines: string[]
): string[] {
  const newLines = [];
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    newLines.push(line);
    const match = line.match(/(.*)<(CodeSandbox|CodeFile) src=["']([^"']*)["'].*>$/);
    if (match) {
      const [, prefix, tag, srcPath] = match;
      const content: string[] = [];
      let contentEndLine: string = '';
      do {
        if (lineNo > lines.length) {
          throw new Error(tag + ' not closed');
        }
        const contentLine = lines[++lineNo];
        if (contentLine.match(new RegExp('</' + tag + '>$'))) {
          contentEndLine = contentLine;
        } else if (contentLine.startsWith(prefix)) {
          content.push(contentLine.slice(prefix.length));
        } else {
          throw new Error(
            'Expecting content of `<' +
              tag +
              '>` to be indented with: ' +
              JSON.stringify(prefix) +
              ' Was: ' +
              JSON.stringify(contentLine) +
              ' in ' +
              mdxPath +
              ' at line ' +
              lineNo
          );
        }
      } while (!contentEndLine);
      const newContent = codeSandboxTransformFn(mdxPath, srcPath, content);
      newLines.push(...newContent.map((l) => prefix + l), contentEndLine);
    }
  }
  return newLines;
}

function syncCodeSandboxes(path: string) {
  transformFile(path, findCodeSandboxes.bind(null, syncCodeSandbox));
}

function syncCodeSandbox(mdxPath: string, srcPath: string, lines: string[]) {
  console.log('SYNCING', mdxPath, srcPath);
  const first = lines[0];
  const newContent = readFile(join('.', srcPath));
  while (newContent.length && newContent[newContent.length - 1] == '') {
    newContent.pop();
  }
  const last = lines[lines.length - 1];
  return [first, ...newContent, last];
}

scanFiles('src/routes', mdxFiles, syncCodeSandboxes);
