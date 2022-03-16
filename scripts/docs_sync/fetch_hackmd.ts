import { join } from 'path';
import { readLines, scanFiles, writeFileLines } from './util';

export function main(dir: string) {
  console.log('Fetching HackMD content...');

  scanFiles(dir, async (file: string) => {
    if (file.endsWith('.mdx')) {
      const fetchLocation = await readFetch(file);
      if (fetchLocation) {
        console.log(file, '<==', fetchLocation);
        const lines = await readLines(fetchLocation);
        await writeFileLines(file, lines);
      }
    }
  });
}

const KEY_VALUE = /^(.\w+):\s+(.*)$/;

async function readFetch(file: string) {
  const lines = await readLines(file);
  if (lines[0] === '---') {
    let row = 1;
    while (row < lines.length && lines[row] !== '---') {
      const line = lines[row++];
      const match = KEY_VALUE.exec(line);
      if (match) {
        const [_, key, value] = match;
        if (key === 'fetch') return value;
      }
    }
  }
  return null;
}

if (require.main === module) {
  main(join(__dirname, '..', '..'));
}
