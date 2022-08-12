/* eslint-disable no-console */
import type {
  Logger,
  NormalizedStaticGeneratorOptions,
  StaticWorkerRenderResult,
  System,
} from '../generator/types';
import fs from 'fs';
import { dirname, isAbsolute, join } from 'path';

export async function createNodeSystem(opts: NormalizedStaticGeneratorOptions, log: Logger) {
  const getFilePath = (outDir: string, pathname: string) => {
    pathname = pathname.slice(1);
    if (!pathname.endsWith('/')) {
      pathname += '/';
    }
    pathname += 'index.html';
    return join(outDir, pathname);
  };

  const ensureDir = async (filePath: string) => {
    try {
      await fs.promises.mkdir(dirname(filePath), { recursive: true });
    } catch (e) {
      //
    }
  };

  const createWriteStream = (filePath: string) => {
    return fs.createWriteStream(filePath, {
      flags: 'w',
    });
  };

  const NS_PER_SEC = 1e9;
  const MS_PER_NS = 1e-6;

  const createTimer = () => {
    const start = process.hrtime();
    return () => {
      const diff = process.hrtime(start);
      return (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS;
    };
  };

  if (typeof opts.errorsOutFile === 'string') {
    await ensureDir(opts.errorsOutFile);

    const consoleErrorLog = log.error.bind(log);
    log.error = async (...msgs) => {
      if (msgs) {
        consoleErrorLog(...msgs);

        const line = msgs.filter((m) => !!m).join(',');
        if (line !== '') {
          try {
            await fs.promises.appendFile(opts.errorsOutFile, line + '\n\n');
          } catch (e) {
            consoleErrorLog(`Error writing log error!`, e);
          }
        }
      }
    };
  }

  let resultsCsvOutFile = opts.resultsCsvOutFile;
  if (resultsCsvOutFile) {
    if (!isAbsolute(resultsCsvOutFile)) {
      resultsCsvOutFile = join(opts.ourDir, resultsCsvOutFile);
    }
  }

  let sitemapOutFile = opts.sitemapOutFile;
  if (sitemapOutFile) {
    if (!isAbsolute(sitemapOutFile)) {
      sitemapOutFile = join(opts.ourDir, sitemapOutFile);
    }
  }

  const sitemapBuffer: string[] = [];
  const resultsCsvBuffer: string[] = [];

  const init = async () => {
    if (sitemapOutFile) {
      await ensureDir(sitemapOutFile);
      await fs.promises.writeFile(
        sitemapOutFile,
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      );
    }

    if (resultsCsvOutFile) {
      await ensureDir(resultsCsvOutFile);
      await fs.promises.writeFile(resultsCsvOutFile, `timestamp,pathname,status,links,duration\n`);
    }
  };

  const appendResult = async (result: StaticWorkerRenderResult) => {
    const promises: Promise<any>[] = [];

    if (sitemapOutFile) {
      sitemapBuffer.push(`<url><loc>${result.url}</loc></url>`);
      if (sitemapBuffer.length > 50) {
        promises.push(fs.promises.appendFile(sitemapOutFile, sitemapBuffer.join('\n') + '\n'));
        sitemapBuffer.length = 0;
      }
    }

    if (resultsCsvOutFile) {
      resultsCsvBuffer.push(
        `${Date.now()},${result.url},${result.status},${result.links.length},${result.duration}`
      );
      if (resultsCsvBuffer.length > 50) {
        promises.push(
          fs.promises.appendFile(resultsCsvOutFile, resultsCsvBuffer.join('\n') + '\n')
        );
        resultsCsvBuffer.length = 0;
      }
    }

    if (promises.length) {
      await Promise.all(promises);
    }
  };

  const close = async () => {
    if (sitemapOutFile) {
      sitemapBuffer.push(`</urlset>`);
      await fs.promises.appendFile(sitemapOutFile, sitemapBuffer.join('\n'));
      sitemapBuffer.length = 0;
    }

    if (resultsCsvOutFile && resultsCsvBuffer.length > 0) {
      await fs.promises.appendFile(resultsCsvOutFile, resultsCsvBuffer.join('\n') + '\n');
      resultsCsvBuffer.length = 0;
    }
  };

  const sys: System = {
    init,
    close,
    ensureDir,
    createWriteStream,
    getFilePath,
    createTimer,
    appendResult,
  };

  return sys;
}

export function createNodeLogger(opts: NormalizedStaticGeneratorOptions) {
  return {
    debug: opts.log === 'debug' ? console.debug.bind(console) : () => {},
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
}
