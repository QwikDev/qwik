import { readdir, readFile, stat, writeFile } from 'fs';
import { get } from 'https';
import { join } from 'path';

export async function scanFiles(
  dir: string,
  callback: (file: string) => Promise<void>
): Promise<void> {
  const promises: Promise<void>[] = [];
  readdir(dir, (err, files) => {
    if (err) return;
    files.forEach((file) => {
      const path = join(dir, file);
      if (file === 'node_modules') return;
      if (file.startsWith('.')) return;
      stat(path, (err, status) => {
        if (err) return;
        if (status.isDirectory()) {
          promises.push(scanFiles(path, callback));
        } else if (status.isFile()) {
          promises.push(callback(path));
        }
      });
    });
  });
  await Promise.all(promises);
}

const hackMdCache = new Map<string, Promise<string[]>>();

export async function readLines(file: string): Promise<string[]> {
  file = file.replace('https:/', 'https://').replace('https:///', 'https://');
  let promise = hackMdCache.get(file);
  if (promise) return promise;

  const index = file.indexOf('https://hackmd.io/');
  if (index === -1) {
    promise = new Promise((res, rej) =>
      readFile(file, (err, data) => (err ? rej(err) : res(String(data).split('\n'))))
    );
  } else {
    const url = file.substring(index) + '/download';
    console.log('FETCHING:', url);
    promise = new Promise<string[]>((resolve, rej) => {
      get(url, (res) => {
        res.setEncoding('utf8');
        let body = '';
        res.on('data', (data) => {
          body += String(data);
        });
        res.on('end', () => {
          resolve(body.split('\n'));
        });
      });
    });
  }
  hackMdCache.set(file, promise);
  return promise;
}

export async function writeFileLines(file: string, lines: string[]) {
  return new Promise((res, rej) =>
    writeFile(file, lines.join('\n'), (err) => (err ? rej(err) : res(null)))
  );
}
